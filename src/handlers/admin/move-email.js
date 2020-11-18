const httpStatus = require('http-status');
const AWS = require('aws-sdk');
const dynamodb = require('aws-sdk/clients/dynamodb');
const { USER_ROLE, PROCESSED_STATUS } = require('../../utils/const');
const { authorizeBearerToken, formatUserData } = require('../../utils/auth');

const docClient = new dynamodb.DocumentClient();
// Get the DynamoDB table name from environment variables
const emailPoolTable = process.env.EMAIL_POOL_TABLE;
const processPoolTable = process.env.PROCESS_POOL_TABLE;

/**
 * A HTTP post method to move email.
 */
exports.lambdaHandler = async (event) => {
  const response = {
    statusCode: httpStatus.OK,
    body: null
  };

  const { body, httpMethod } = event;

  if (httpMethod !== 'POST') {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify(`move-email only accepts POST method, but you tried: ${httpMethod}.`);
    return response;
  }

  const token = event.headers.Authorization;
  const authorized = await authorizeBearerToken(token);

  if (!authorized.payload) {
    response.statusCode = httpStatus.UNAUTHORIZED;
    return response;
  }

  const { emailId } = JSON.parse(body);

  if (!emailId) {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify({ errMsg: 'Email id is missing' });
    return response;
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
      // update status and remove the resolvedBy field in email pool
      const params = {
        TableName: emailPoolTable,
        Key: {
          id: emailId
        },
        UpdateExpression: 'set #emailStatus = :currentStatus, resolvedBy = :emptyUserId',
        ExpressionAttributeNames: {
          '#emailStatus': 'status'
        },
        ExpressionAttributeValues: {
          ':currentStatus': PROCESSED_STATUS.PENDING,
          ':emptyUserId': ''
        },
        ReturnValues: 'UPDATED_NEW'
      };
      await docClient.update(params).promise();

      // Move this email to process pool
      const params1 = {
        TableName: processPoolTable,
        Item: {
          emailId,
          createdAt: Date.now(),
          startedAt: '',
          userId: ''
        }
      };
      const movedData = await docClient.put(params1).promise();
      response.body = JSON.stringify(movedData);
    } else {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'Invalid permission' });
    }
  } catch (err) {
    response.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    response.body = JSON.stringify({ errMsg: err.message });
  }

  return response;
};
