const { MongoClient } = require('mongodb');

const state = {
    db: null
};

module.exports.connect = (done) => {
    const url = 'mongodb://localhost:27017'; // MongoDB connection URL
    const dbname = 'shopping'; // Database name

    const client = new MongoClient(url, { useUnifiedTopology: true });

    client.connect()
        .then(() => {
            state.db = client.db(dbname);
            done(); // success
        })
        .catch((err) => {
            done(err); // pass error back
        });
};

module.exports.get = () => {
    return state.db;
};
