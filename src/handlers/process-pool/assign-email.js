const httpStatus = require('http-status');
const AWS = require('aws-sdk');
const dynamodb = require('aws-sdk/clients/dynamodb');
const { USER_STATUS } = require('../../utils/const');
const { authorizeBearerToken, formatUserData } = require('../../utils/auth');
const { ALLOW_CORS } = require('../../utils/cors');

const docClient = new dynamodb.DocumentClient();
// Get the DynamoDB table name from environment variables
const emailPoolTable = process.env.EMAIL_POOL_TABLE;
const processPoolTable = process.env.PROCESS_POOL_TABLE;

/**
 * A HTTP get method to assign email.
 */
exports.lambdaHandler = async (event) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS,
    body: null
  };

  const { httpMethod } = event;

  if (httpMethod !== 'GET') {
    response.statusCode = httpStatus.BAD_REQUEST;
    response.body = JSON.stringify(`assign-email only accepts POST method, but you tried: ${httpMethod}.`);
    return response;
  }

  const token = event.headers.Authorization;
  const authorized = await authorizeBearerToken(token);

  if (!authorized.payload) {
    response.statusCode = httpStatus.UNAUTHORIZED;
    return response;
  }

  try {
    // check if user status is away or active
    // If status is away, just return without any operation
    // else if status is active, try to assign new email from process pool
    // At that time, try to choose the dldest email from pool
    const userId = authorized.payload.username;
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

    if (data.status === USER_STATUS.ACTIVE) {
      // check if there is email assigned already
      const scanParams = {
        TableName: processPoolTable,
        FilterExpression: '#userId = :currentUserId',
        ExpressionAttributeNames: {
          '#userId': 'userId'
        },
        ExpressionAttributeValues: {
          ':currentUserId': userId
        }
      };

      let existData;

      do {
        existData = await docClient.scan(scanParams).promise();

        if (existData) {
          // update status in process pool
          for (let i = 0; i < existData.Count; i++) {
            const item = existData.Items[i];
            const params = {
              TableName: processPoolTable,
              Key: {
                emailId: item.emailId,
                createdAt: item.createdAt
              },
              UpdateExpression: 'set userId = :currentUserId, startedAt = :currentTimestamp',
              ExpressionAttributeValues: {
                ':currentUserId': '',
                ':currentTimestamp': ''
              }
            };
            await docClient.update(params).promise();
          }
        }
        scanParams.ExclusiveStartKey = existData.LastEvaluatedKey;
      } while (typeof existData.LastEvaluatedKey !== 'undefined');

      // get oldest email from process pool
      const assignParams = {
        TableName: processPoolTable,
        FilterExpression: '#userId = :emptyUserId',
        ExpressionAttributeNames: {
          '#userId': 'userId'
        },
        ExpressionAttributeValues: {
          ':emptyUserId': ''
        }
      };

      let minValue = 0;
      let oldestEmail;

      // Right now scan emails but we should consider to use Redis or parellel processing.
      do {
        existData = await docClient.scan(assignParams).promise();
        oldestEmail = getOldestEmail(existData, minValue);
        minValue = oldestEmail.createdAt;
        scanParams.ExclusiveStartKey = existData.LastEvaluatedKey;
      } while (typeof existData.LastEvaluatedKey !== 'undefined');

      // assign this email into user
      if (oldestEmail) {
        // update status in process pool
        const params = {
          TableName: processPoolTable,
          Key: {
            emailId: oldestEmail.emailId,
            createdAt: oldestEmail.createdAt
          },
          UpdateExpression: 'set userId = :currentUserId, startedAt = :currentTimestamp',
          ExpressionAttributeValues: {
            ':currentUserId': userId,
            ':currentTimestamp': Date.now()
          }
        };
        await docClient.update(params).promise();

        // Get and send this email to client
        const params1 = {
          TableName: emailPoolTable,
          Key: {
            id: oldestEmail.emailId
          }
        };
        const { Item } = await docClient.get(params1).promise();
        const result = Item;
        result.createdAt = oldestEmail.createdAt;
        response.body = JSON.stringify(result);
      } else {
        response.body = JSON.stringify({ errMsg: 'There is no email should be processed.' });
      }
    } else {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'User goes away' });
    }
  } catch (err) {
    response.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    response.body = JSON.stringify({ errMsg: err.message });
  }

  return response;
};

function getOldestEmail (data, minValue) {
  let min;
  let c = 0;

  if (minValue === 0) {
    min = data.Items[0].createdAt;
  } else {
    min = minValue;
  }

  for (let i = 0; i < data.Count; i++) {
    if (data.Items[i].createdAt < min) {
      min = data.Items[i].createdAt;
      c = i;
    }
  }

  return data.Items[c];
};
