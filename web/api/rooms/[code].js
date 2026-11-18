const { route } = require('../_rooms');

module.exports = (req, res) => route(req, res, [req.query.code]);
