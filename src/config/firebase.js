const admin = require('firebase-admin');
const serviceAccount = require('./bazaar-2aa3a-firebase-adminsdk-fbsvc-270d47e77a.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

module.exports = admin;
