# Simple email check service backend

## Overview

[serverless](https://www.serverless.com/) is used to manage this project.

The backend is consist of lambda APIs, API Gateway, Cognito for user management, CloudFormation, and DynamoDB to manage the database.
Main source structure so far are:

- cognito
- handler
- utils

## Getting started

Installed on your system you will need Node.js 12, Docker, AWS CLI, and [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install-linux.html)

To lint JavaScript files, you will need `eslint` installed globally.

## Build and Starting in local

You will need to run below commands in root directory in order to build backend project and start it in local.

`sam build` \
`sam local start-api`

## Deployment

To deploy backend, run below command in root directory.

`sam deploy`

## External-facing APIs, Resources

### Cognito User Pool

- Allows authentication of new and existing users with email and password
- User pool client id is provided by CloudFomation output.

### AWS S3

- Now S3 bucket name is 'email-check-backend'. If you need to change bucket, feel free to change it from samconfig.toml file.

## Todo

- Current this backend is using the DynamoDB table to process email as pool. To keep the high performance, will need to use memory database like Redis.
- To send email, should be integrated to email service like SendGrid. For that, need keys
- If there are a lot of emails should be processed, try to use AWS Elastic Search.
- Should be added unit tests.