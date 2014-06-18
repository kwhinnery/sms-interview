// SMS keyword commands
module.exports = {
    register: require('./register'),
    report: require('./report').report,
    change: require('./report').change,
    ok: require('./confirm').ok,
    comment: require('./confirm').comment
};