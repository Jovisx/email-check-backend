const httpStatus = require('http-status');
const auth = require('../../utils/auth');
const utils = require('../../utils/utils');
const { PROCESSED_STATUS } = require('../../utils/const');
const { USER_ROLE } = require('../../utils/const');
const { ALLOW_CORS } = require('../../utils/cors');

/**
 * A HTTP post method to move email.
 */
exports.lambdaHandler = async (event) => {
  const response = {
    statusCode: httpStatus.OK,
    headers: ALLOW_CORS,
    body: null
  };

  try {
    const { statusCode, user } = await auth.checkAuthAndGetUserData(event);

    if (statusCode) {
      response.statusCode = statusCode;
      return response;
    }

    const { emailId } = JSON.parse(event.body);

    if (!emailId) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'Email id is missing' });
      return response;
    }

    if (user.role === USER_ROLE.ADMIN) {
      // return back email to original state
      await utils.updateEmailInPool(emailId, PROCESSED_STATUS.PENDING, '');
      // add this email to process pool
      await utils.addEmailToProcessTable(emailId);
      await utils.increaseProcessCount();
      response.body = JSON.stringify({ data: emailId });
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
