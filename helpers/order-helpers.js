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
                if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
                    throw new Error('Invalid user ID');
                }
                let orders = await db.get().collection(collection.ORDER_COLLECTION)
                    .find({ userId: new objectId(userId) })
                    .toArray();
                resolve(orders);
            } catch (err) {
                reject(err);
            }
        });
    },

    shipOrder: (orderId) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (!/^[0-9a-fA-F]{24}$/.test(orderId)) {
                    throw new Error('Invalid ObjectId');
                }
                const order = await db.get().collection(collection.ORDER_COLLECTION)
                    .findOne({ _id: new objectId(orderId) });
                if (!order) {
                    throw new Error('Order not found');
                }
                if (order.status === 'Delivered' || order.status === 'Cancelled') {
                    throw new Error('Cannot ship a delivered or cancelled order');
                }
                const result = await db.get().collection(collection.ORDER_COLLECTION)
                    .updateOne(
                        { _id: new objectId(orderId) },
                        { $set: { status: 'Shipped', updatedAt: new Date() } }
                    );
                if (result.matchedCount === 0) {
                    throw new Error('Order not found');
                }
                resolve(result);
            } catch (err) {
                reject(err);
            }
        });
    },

    deliverOrder: (orderId) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (!/^[0-9a-fA-F]{24}$/.test(orderId)) {
                    throw new Error('Invalid ObjectId');
                }
                const order = await db.get().collection(collection.ORDER_COLLECTION)
                    .findOne({ _id: new objectId(orderId) });
                if (!order) {
                    throw new Error('Order not found');
                }
                if (order.status === 'Delivered' || order.status === 'Cancelled') {
                    throw new Error('Cannot deliver a delivered or cancelled order');
                }
                if (order.status !== 'Shipped') {
                    throw new Error('Order must be shipped before it can be delivered');
                }
                const result = await db.get().collection(collection.ORDER_COLLECTION)
                    .updateOne(
                        { _id: new objectId(orderId) },
                        { $set: { status: 'Delivered', updatedAt: new Date() } }
                    );
                if (result.matchedCount === 0) {
                    throw new Error('Order not found');
                }
                resolve(result);
            } catch (err) {
                reject(err);
            }
        });
    },

    cancelOrder: (orderId, userId) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (!/^[0-9a-fA-F]{24}$/.test(orderId) || !/^[0-9a-fA-F]{24}$/.test(userId)) {
                    throw new Error('Invalid ObjectId');
                }
                const order = await db.get().collection(collection.ORDER_COLLECTION)
                    .findOne({ _id: new objectId(orderId), userId: new objectId(userId) });
                if (!order) {
                    throw new Error('Order not found or unauthorized');
                }
                if (order.status === 'Delivered' || order.status === 'Cancelled') {
                    throw new Error('Cannot cancel a delivered or already cancelled order');
                }
                const result = await db.get().collection(collection.ORDER_COLLECTION)
                    .updateOne(
                        { _id: new objectId(orderId) },
                        { $set: { status: 'Cancelled', updatedAt: new Date() } }
                    );
                if (result.matchedCount === 0) {
                    throw new Error('Order not found');
                }
                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    },

    getOrderDetails: (orderId) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (!/^[0-9a-fA-F]{24}$/.test(orderId)) {
                    throw new Error('Invalid ObjectId');
                }
                const order = await db.get().collection(collection.ORDER_COLLECTION)
                    .findOne({ _id: new objectId(orderId) });
                if (!order) {
                    throw new Error('Order not found');
                }
                resolve(order);
            } catch (err) {
                reject(err);
            }
        });
    }
};