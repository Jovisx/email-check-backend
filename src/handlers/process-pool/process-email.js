const httpStatus = require('http-status');
const auth = require('../../utils/auth');
const utils = require('../../utils/utils');
const { PROCESSED_STATUS } = require('../../utils/const');
const { ALLOW_CORS } = require('../../utils/cors');

/**
 * A HTTP post method to process email.
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

    const { emailId, status } = JSON.parse(event.body);

    if (!emailId) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'Missing email id' });
      return response;
    }

    if (!status) {
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: 'Missing status' });
      return response;
    }

    if (status === PROCESSED_STATUS.EXPIRED) {
      await utils.unassignEmailFromUser(emailId);
    } else if (
      status === PROCESSED_STATUS.NOTLEAD ||
      status === PROCESSED_STATUS.POSITIVE ||
      status === PROCESSED_STATUS.NEUTRAL
    ) {
      await utils.removeEmailFromProcessPool(emailId);
      await utils.decreaseProcessCount();
      const data = await utils.updateEmailInPool(emailId, status, user.id);
      response.body = JSON.stringify({ data: data.Attributes});

      if (status !== PROCESSED_STATUS.NOTLEAD) {
        // TODO: send this email to pre-defined email address
        // We can use sendGrid but will require KEY
      }
    } else {
      // Invalid status
      response.statusCode = httpStatus.BAD_REQUEST;
      response.body = JSON.stringify({ errMsg: `Invalid status: ${status}` });
    }
  } catch (err) {
    response.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    response.body = JSON.stringify({ errMsg: err.message });
  }

  return response;
};
