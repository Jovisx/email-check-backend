const httpStatus = require('http-status');
const dynamodb = require('aws-sdk/clients/dynamodb');
const AWS = require('aws-sdk');
const { USER_ROLE } = require('../../utils/const');
const { authorizeBearerToken, formatUserData } = require('../../utils/auth');
const { ALLOW_CORS } = require('../../utils/cors');

const docClient = new dynamodb.DocumentClient();
// Get the DynamoDB table name from environment variables
const tableName = process.env.EMAIL_POOL_TABLE;

/**
 * A HTTP get method to get all emails from a DynamoDB table.
 */
exports.lambdaHandler = async (event) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS,
    body: null
  };

  const token = event.headers.Authorization;
  const authorized = await authorizeBearerToken(token);

  if (!authorized.payload) {
    response.statusCode = httpStatus.UNAUTHORIZED;
    return response;
  }

  const { httpMethod } = event;

  if (httpMethod !== 'GET') {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify(`get-emails only accept GET method, but you tried: ${httpMethod}`);
    return response;
  }

  let limit = 20;

  if (event.queryStringParameters && event.queryStringParameters.limit) {
    limit = event.queryStringParameters.limit;
  }

  try {
    // Check if user is admin
    const cognito = new AWS.CognitoIdentityServiceProvider({
      apiVersion: '2016-04-18'
    });

    const user = await cognito
      .adminGetUser({
        UserPoolId: process.env.APP_POOL_ID,
        Username: authorized.payload.sub
      })
      .promise();

    const data = formatUserData(user);

    if (data.role === USER_ROLE.ADMIN) {
      // get all emails from the table (only first 1MB data, you can use `LastEvaluatedKey` to get the rest of data)
      const params = {
        TableName: tableName,
        Limit: limit
      };
      const { Items } = await docClient.scan(params).promise();
      response.body = JSON.stringify(Items);
    } else {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'Invalid permission' });
    }
  } catch (err) {
    response.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    response.body = JSON.stringify(err.message);
  }

  return response;
};
