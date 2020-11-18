const httpStatus = require('http-status');
const dynamodb = require('aws-sdk/clients/dynamodb');
const { authorizeBearerToken } = require('../../utils/auth');

const docClient = new dynamodb.DocumentClient();
// Get the DynamoDB table name from environment variables
const tableName = process.env.EMAIL_POOL_TABLE;

/**
 * A HTTP get method to get one email by id from a DynamoDB table.
 */
exports.lambdaHandler = async (event) => {
  const response = {
    statusCode: httpStatus.OK,
    body: null
  };

  const token = event.headers.Authorization;
  const authorized = await authorizeBearerToken(token);

  if (!authorized.payload) {
    response.statusCode = httpStatus.UNAUTHORIZED;
    return response;
  }

  const { httpMethod, pathParameters } = event;

  if (httpMethod !== 'GET') {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify(`get-by-id only accept GET method, but you tried: ${httpMethod}`);
    return response;
  }

  try {
    // Get id from pathParameters from APIGateway because of `/{id}` at template.yml
    const { id } = pathParameters;

    // Get the item from the table
    const params = {
      TableName: tableName,
      Key: { id }
    };
    const { Item } = await docClient.get(params).promise();
    response.body = JSON.stringify(Item);
  } catch (err) {
    response.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    response.body = JSON.stringify(err.message);
  }

  return response;
};
