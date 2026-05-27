const handler = require("../../api/captures.js");

handler.config = {
  api: {
    bodyParser: false
  }
};

module.exports = handler;
module.exports.config = handler.config;
