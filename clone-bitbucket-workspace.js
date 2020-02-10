const { Bitbucket } = require('bitbucket');
const Inquirer = require('inquirer');
const debug = require('debug');

// Logger
const defaultDebug = debug('clone-workspace');
const logger = {
  error: (param, text) => {
    const extendedDebug = defaultDebug.extend('error').extend(param);
    extendedDebug(text);
  },
  debug: (param, text) => {
    const extendedDebug = defaultDebug.extend('debug').extend(param);
    extendedDebug(text);
  },
};

// Sleep to prevent rate limits errors
const sleep = (milliseconds) => {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}

// Promise based cmd executions
const execShellCommand = cmd => {
  const exec = require('child_process').exec;
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      }
      resolve(stdout ? stdout : stderr);
    });
  });
};

// Filter repos with no main branch / empty repos
const filterRepo = data => data.filter(repo => {
  return (repo.mainbranch != null);
});

// Canonical Title for execShellCommand
const canonicalTitle = (title) => {
  return title.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/ig, '-')
    .replace(/-+/g, '-')
    .replace(/-*$/, '');
};

// Clone Repo
const repoClone = async repoListObject => {
  await execShellCommand(`rm -fr repositories`);
  for (let i = 0; i < repoListObject.length; i++) {
    const { full_name, name } = repoListObject[i];
    try {
      logger.debug(`[${i + 1}]execShellCommand.clone.${name}`, 'Started');
      await execShellCommand(`git clone git@bitbucket.org:${full_name}.git ./repositories/${canonicalTitle(name)}`);
      logger.debug(`[${i + 1}]execShellCommand.clone.${name}`, 'Done');
    } catch (repo_err) {
      logger.error(`[${i + 1}]execShellCommand.clone.${name}`, repo_err);
      throw repo_err;
    }
  }

  return true;
}

// Main Function
(
  async () => {
    try {
      const answers = await Inquirer.prompt([
        {
          type: 'input',
          name: 'bitbucket_user',
          message: 'BitBucket User',
          default: '',
        },
        {
          type: 'password',
          name: 'bitbucket_password',
          message: 'BitBucket User Password',
          default: '',
        },
        {
          type: 'input',
          name: 'bitbucket_workspace',
          message: 'BitBucket Workspace',
          default: '',
        },
      ]);

      // BitBucket Instance
      const clientOptions = {
        auth: {
          username: answers.bitbucket_user,
          password: answers.bitbucket_password,
        },
        baseUrl: 'https://api.bitbucket.org/2.0',
        request: {
          timeout: 99999
        },
      };
      const bitbucket = new Bitbucket(clientOptions);
      const workspace = answers.bitbucket_workspace;

      let params = {
        workspace,
        pagelen: 100,
        page: 1,
      };
      let finalStatus = 500;
      const { data, status } = await bitbucket.repositories.list({ ...params });
      finalStatus = status;
      logger.debug('bitbucket.repositories.list.status', finalStatus);

      const repoListObject = [...filterRepo(data.values)];
      const loopLists = Math.ceil(data.size / params.pagelen) - 1;
      logger.debug('bitbucket.repositories.list.loopLists', loopLists);
      for (let i = 0; i < loopLists; i++) {
        sleep(1000);
        params.page += 1;
        const { data, status } = await bitbucket.repositories.list({ ...params });
        finalStatus = status;
        logger.debug('bitbucket.repositories.list.status', finalStatus);
        repoListObject.push(...filterRepo(data.values));
      }

      if (finalStatus === 200) {
        logger.debug('repoListObject', repoListObject.length);
        const repoCloneResponse = await repoClone(repoListObject);
        logger.debug('repoCloneResponse', repoCloneResponse);
      }
    } catch (err) {
      logger.error('bitbucket.repositories.list.err', err);
    }
  }
)();