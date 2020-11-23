const httpStatus = require('http-status');
const dynamodb = require('aws-sdk/clients/dynamodb');
const { authorizeBearerToken } = require('../../utils/auth');
const { ALLOW_CORS } = require('../../utils/cors');

const docClient = new dynamodb.DocumentClient();
// Get the DynamoDB table name from environment variables
const tableName = process.env.EMAIL_POOL_TABLE;

/**
 * A HTTP get method to get one email by id from a DynamoDB table.
 */
exports.lambdaHandler = async (event) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS,
    body: null
  };

  try {
    const { statusCode } = await auth.checkAuthAndGetUserData(event);

    if (statusCode) {
      response.statusCode = statusCode;
      return response;
    }

    const { id } = event.pathParameters;
    // Get the item from the table
    const params = {
      TableName: tableName,
      Key: { id }
    };
    const { Item } = await docClient.get(params).promise();
    response.body = JSON.stringify({ data: Item });
  } catch (err) {
    response.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    response.body = JSON.stringify({ errMsg: err.message });
  }

  return response;
};
