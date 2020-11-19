const httpStatus = require('http-status');
const dynamodb = require('aws-sdk/clients/dynamodb');
const { authorizeBearerToken } = require('../../utils/auth');
const { PROCESSED_STATUS } = require('../../utils/const');
const { v4: uuidv4 } = require('uuid');
const { ALLOW_CORS } = require('../../utils/cors');

const docClient = new dynamodb.DocumentClient();
// Get the DynamoDB table name from environment variables
const emailPoolTable = process.env.EMAIL_POOL_TABLE;
const processPoolTable = process.env.PROCESS_POOL_TABLE;

/**
 * A HTTP post method to add one email to a DynamoDB table.
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

  const { body, httpMethod } = event;

  if (httpMethod !== 'POST') {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify(`put-email only accepts POST method, but you tried: ${httpMethod}.`);
    return response;
  }

  try {
    // Add new emails
    const emailData = JSON.parse(body);
    for (let i = 0; i < emailData.length; i++) {
      const id = uuidv4();
      // First, add email into email pool
      const params = {
        TableName: emailPoolTable,
        Item: {
          id,
          subject: emailData[i].subject,
          emailLead: emailData[i].emailLead,
          status: PROCESSED_STATUS.PENDING,
          createdAt: emailData[i].createdAt,
          emailBody: emailData[i].emailBody,
          resolvedBy: ''
        }
      };
      await docClient.put(params).promise();
      // Second, add id(email id), timestamp(createdAt), userId(just empty user) into process pool
      const params1 = {
        TableName: processPoolTable,
        Item: {
          emailId: id,
          createdAt: Date.now(),
          startedAt: '',
          userId: ''
        }
      };
      await docClient.put(params1).promise();
    }
    response.body = body;
  } catch (err) {
    response.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    response.body = JSON.stringify(err.message);
  }

  return response;
};
