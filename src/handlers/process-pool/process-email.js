const httpStatus = require('http-status');
const dynamodb = require('aws-sdk/clients/dynamodb');
const { PROCESSED_STATUS } = require('../../utils/const');
const { authorizeBearerToken } = require('../../utils/auth');

const docClient = new dynamodb.DocumentClient();
// Get the DynamoDB table name from environment variables
const emailPoolTable = process.env.EMAIL_POOL_TABLE;
const processPoolTable = process.env.PROCESS_POOL_TABLE;

/**
 * A HTTP post method to process email.
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

  const userId = authorized.payload.username;
  const { body, httpMethod } = event;

  if (httpMethod !== 'POST') {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify(`process-email only accepts POST method, but you tried: ${httpMethod}.`);
    return response;
  }

  try {
    const { emailId, createdAt, status } = JSON.parse(body);

    if (!emailId) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify('Missing email id');
      return response;
    }

    if (!status) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify('Missing status');
      return response;
    }

    if (status === PROCESSED_STATUS.EXPIRED) {
      // Unlock email from user in pool and assign this email to another user.
      // Unlock meaning the releasing the assigned userId into a email
      const params = {
        TableName: processPoolTable,
        Key: {
          emailId,
          createdAt
        },
        UpdateExpression: 'set userId = :emptyUserId',
        ExpressionAttributeValues: {
          ':emptyUserId': ''
        },
        ReturnValues: 'UPDATED_NEW'
      };
      const updatedData = await docClient.update(params).promise();
      response.body = JSON.stringify(updatedData);
    } else if (
      status === PROCESSED_STATUS.NOTLEAD ||
      status === PROCESSED_STATUS.POSITIVE ||
      status === PROCESSED_STATUS.NEUTRAL
    ) {
      // remove this email from process pool
      const params = {
        TableName: processPoolTable,
        Key: {
          emailId,
          createdAt
        }
      };
      await docClient.delete(params).promise();

      // update status in email pool
      const params1 = {
        TableName: emailPoolTable,
        Key: {
          id: emailId
        },
        UpdateExpression: 'set #processedStatus = :currentStatus, resolvedBy = :currentUserId',
        ExpressionAttributeNames: {
          '#processedStatus': 'status'
        },
        ExpressionAttributeValues: {
          ':currentStatus': status,
          ':currentUserId': userId
        },
        ReturnValues: 'UPDATED_NEW'
      };
      const updatedData = await docClient.update(params1).promise();
      response.body = JSON.stringify(updatedData);

      if (status !== PROCESSED_STATUS.NOTLEAD) {
        // TODO: send this email to pre-defined email address
        // We can use sendGrid but will require KEY
      }
    } else {
      // Invalid status
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify(`Invalid status: ${status}`);
    }
  } catch (err) {
    response.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    response.body = JSON.stringify(err.message);
  }

  return response;
};
