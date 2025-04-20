const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');

async function initAdmin() {
    const uri = 'mongodb+srv://marvankp847:Z0UkkKDAGGrpdF5e@shopping.skba5o5.mongodb.net/?retryWrites=true&w=majority&appName=shopping'; // Update with your MongoDB URI
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db();
        const adminCollection = db.collection('ADMIN_COLLECTION');

        const admin = {
            Email: 'marvankp847@gmail.com',
            Password: bcrypt.hashSync('1526', 10), // Hashed password
            isSuperAdmin: true
        };

        await adminCollection.insertOne(admin);
        console.log('Super admin created successfully');
    } catch (err) {
        console.error('Error creating super admin:', err);
    } finally {
        await client.close();
    }
}

initAdmin();