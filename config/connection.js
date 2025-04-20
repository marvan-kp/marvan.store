const { MongoClient } = require('mongodb');

const state = {
    db: null
};

module.exports.connect = (done) => {
    const url = 'mongodb+srv://marvankp847:Z0UkkKDAGGrpdF5e@shopping.skba5o5.mongodb.net/?retryWrites=true&w=majority&appName=shopping';
    const dbname = 'test';

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
