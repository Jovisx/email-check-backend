const httpStatus = require('http-status');
const auth = require('../../utils/auth');
const utils = require('../../utils/utils');
const { ALLOW_CORS } = require('../../utils/cors');
const { USER_ROLE } = require('../../utils/const');

const tableName = process.env.PROCESS_POOL_TABLE;

/**
 * A HTTP get method to get all emails from a DynamoDB table.
 */
exports.lambdaHandler = async (event) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS,
    body: null
  };

  try {
    const { queryStringParameters } = event;
    const { limit = 16, offset = 0, LastEvaluatedKey = null } = queryStringParameters;
    const { statusCode, user } = await auth.checkAuthAndGetUserData(event);

    if (statusCode) {
      response.statusCode = statusCode;
      return response;
    }

    if (user.role === USER_ROLE.ADMIN) {
      response.body = await utils.getTableData(tableName, offset, limit, LastEvaluatedKey);
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
