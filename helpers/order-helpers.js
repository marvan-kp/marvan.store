var db = require('../config/connection');
var collection = require('../config/collections');
var objectId = require('mongodb').ObjectId;

module.exports = {
    getAllOrders: () => {
        return new Promise(async (resolve, reject) => {
            try {
                let orders = await db.get().collection(collection.ORDER_COLLECTION).find().toArray();
                resolve(orders);
            } catch (err) {
                reject(err);
            }
        });
    },
    getUserOrders: (userId) => {
        return new Promise(async (resolve, reject) => {
            try {
                let orders = await db.get().collection(collection.ORDER_COLLECTION)
                    .find({ userId: new objectId(userId) })
                    .sort({ date: -1 })
                    .toArray();
                resolve(orders);
            } catch (err) {
                reject(err);
            }
        });
    },
    cancelOrder: (orderId, userId) => {
        return new Promise(async (resolve, reject) => {
          try {
            const result = await db.get().collection(collection.ORDER_COLLECTION).updateOne(
              { _id: new objectId(orderId), userId: new objectId(userId) },
              { $set: { status: "Cancelled" } }
            );
            resolve(result.modifiedCount > 0);
          } catch (err) {
            reject(err);
          }
        });
    },
    shipOrder: (orderId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await db.get().collection(collection.ORDER_COLLECTION).updateOne(
                    { _id: new objectId(orderId), status: 'Placed' },
                    { $set: { status: 'Shipped' } }
                );
                if (result.matchedCount === 0) {
                    reject(new Error('Order not found or not in Placed status'));
                } else {
                    resolve(true);
                }
            } catch (err) {
                reject(err);
            }
        });
    },
    deliverOrder: (orderId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await db.get().collection(collection.ORDER_COLLECTION).updateOne(
                    { _id: new objectId(orderId), status: 'Shipped' },
                    { $set: { status: 'Delivered' } }
                );
                if (result.matchedCount === 0) {
                    reject(new Error('Order not found or not in Shipped status'));
                } else {
                    resolve(true);
                }
            } catch (err) {
                reject(err);
            }
        });
    }
};