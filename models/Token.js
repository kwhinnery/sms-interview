var mongoose = require('mongoose');

var TokenSchema = new mongoose.Schema({
    userId: { 
        type: String, 
        required: true 
    },
    expires: {
        type: Number,
        default: Date.now() + 24 * 60 * 60 * 1000 // expire after a day
    }
});

module.exports = mongoose.model('Token', TokenSchema);
