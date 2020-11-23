const httpStatus = require('http-status');
const auth = require('../../utils/auth');
const utils = require('../../utils/utils');
const { ALLOW_CORS } = require('../../utils/cors');
const { USER_STATUS } = require('../../utils/const');

/**
 * A HTTP get method to assign email.
 */
exports.lambdaHandler = async (event) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS,
    body: null
  };

   try {
    // check if user status is away or active
    // If status is away, just return without any operation
    // else if status is active, try to assign new email from process pool
    // At that time, try to choose the dldest email from pool
    const { statusCode, user } = await auth.checkAuthAndGetUserData(event);

    if (statusCode) {
      response.statusCode = statusCode;
      return response;
    }

    if (user.status === USER_STATUS.ACTIVE) {
      await utils.unassignAllEmailsFromUser(user.id);
      const oldestEmail = await utils.getOldestEmailFromProcessPool();

      if (oldestEmail) {
        response.body = await utils.assignEmailToUser(user.id, oldestEmail);
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

