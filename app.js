var config = require('./config');

// Init MongoDB/Mongoose
require('mongoose').connect(config.mongoUrl);

// Create/run Gopher Express web app (pre-configured Express 4 web app)
var app = require('gopher');
app.use(require('express-ejs-layouts'));

require('./controllers')(app);
