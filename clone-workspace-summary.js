const path = require('path');
const fs = require('fs');
const debug = require('debug');
const yaml = require('yamljs');
const Inquirer = require('inquirer');

const directoryPath = path.join(__dirname, 'repositories');

// Logger
const defaultDebug = debug('clone-workspace-summary');
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

// List all repos
const listAllRepos = () => {
  return new Promise((resolve, reject) => {
    fs.readdir(directoryPath, function (err, files) {
      if (err) {
        logger.error('listAllRepos.err', err);
        reject(err);
      }

      const listOfRepos = [];
      files.forEach(file => {
        listOfRepos.push({
          name: file,
          path: `${directoryPath}/${file}`,
          circleConfigPresent: false,
          serverlessYmlPresent: false,
          listofEnvVariables: [],
          circleConfigProductionSteps: false,
        });
      });

      resolve(listOfRepos);
    });
  });
};

// Check if CircleCI and Serverless config exists
const circleServerlessPresent = async (listOfRepos) => {
  return listOfRepos.map(repo => {
    const circleConfigPresent = fs.existsSync(`${repo.path}/.circleci/config.yml`);
    const serverlessYmlPresent = fs.existsSync(`${repo.path}/serverless.yml`);
    const response = {
      ...repo,
      circleConfigPresent,
      serverlessYmlPresent,
    };

    return response;
  });
};

// Extract serverless env variables
const extractServerlessVariables = async (listOfRepos) => {
  return listOfRepos.map(repo => {
    const response = {
      ...repo,
    };

    if (repo.serverlessYmlPresent) {
      const yamlString = fs.readFileSync(`${repo.path}/serverless.yml`, 'utf8');
      const { environment } = yaml.parse(yamlString).provider
      if (environment) {
        response.listofEnvVariables.push(...Object.keys(environment));
      }
    }

    return response;
  });
};

// Check production steps exists
const checkProductionSteps = async (listOfRepos) => {
  return listOfRepos.map(repo => {
    const response = {
      ...repo,
    };

    if (repo.circleConfigPresent) {
      const yamlString = fs.readFileSync(`${repo.path}/.circleci/config.yml`, 'utf8');
      if (yamlString) {
        const { jobs } = yaml.parse(yamlString);
        if (jobs) {
          const match = Object.keys(jobs).find(value => /(prod|live|deploy$)/.test(value));
          response.circleConfigProductionSteps = !!match;
        }
      }
    }

    return response;
  });
};

// Main Function
(
  async () => {
    try {
      const answers = await Inquirer.prompt([
        {
          type: 'input',
          name: 'report_name',
          message: 'Name of report (without extension)',
          default: '',
        },
      ]);

      logger.debug('directoryPath', directoryPath);
      const listAllReposResponse = await listAllRepos();
      logger.debug('listAllRepos', 'Done');

      const circleServerlessPresentResponse = await circleServerlessPresent(listAllReposResponse);
      logger.debug('circleServerlessPresent', 'Done');

      const extractServerlessVariablesResponse = await extractServerlessVariables(circleServerlessPresentResponse);
      logger.debug('extractServerlessVariables', 'Done');

      const checkProductionStepsResponse = await checkProductionSteps(extractServerlessVariablesResponse);
      logger.debug('checkProductionSteps', 'Done');

      // create the csv
      const createCsvWriter = require('csv-writer').createObjectCsvWriter;
      const csvWriter = createCsvWriter({
        path: `${answers.report_name}.csv`,
        header: [
          { id: 'name', title: 'NAME' },
          { id: 'circleConfigPresent', title: 'CircleCI Config Present' },
          { id: 'serverlessYmlPresent', title: 'Serverless.yml Present' },
          { id: 'circleConfigProductionSteps', title: 'Production Steps in CircleCI' },
          { id: 'listofEnvVariables', title: 'ENV Variables (serverless.yml)' },
        ]
      });

      csvWriter.writeRecords(checkProductionStepsResponse)
        .then(data => {
          logger.debug('createCsvWriter', data);
          process.exit();
        });
    } catch (err) {
      logger.error('main.err', err);
    }
  }
)();