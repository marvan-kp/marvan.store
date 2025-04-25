var db = require('../config/connection');
var collection = require('../config/collections');
var objectId = require('mongodb').ObjectId;

module.exports = {
    addProduct: (product) => {
        return new Promise((resolve, reject) => {
            try {
                if (!product.Name || !product.Category || !product.Price || !product.Description) {
                    throw new Error('All fields (Name, Category, Price, Description) are required');
                }
                product.Images = product.Images || ['default-image.jpg'];
                product.Specifications = product.Specifications || {};
                product.Reviews = product.Reviews || [];

                db.get().collection(collection.PRODUCT_COLLECTION).insertOne(product)
                    .then((data) => {
                        resolve(data.insertedId);
                    })
                    .catch((err) => {
                        reject(err);
                    });
            } catch (err) {
                reject(err);
            }
        });
    },

    getAllProducts: () => {
        return new Promise(async (resolve, reject) => {
            try {
                let products = await db.get().collection(collection.PRODUCT_COLLECTION).find().toArray();
                resolve(products);
            } catch (err) {
                reject(err);
            }
        });
    },

    deleteProduct: (proId) => {
        return new Promise((resolve, reject) => {
            try {
                if (!/^[0-9a-fA-F]{24}$/.test(proId)) {
                    throw new Error('Invalid ObjectId');
                }
                console.log('Deleting product with ID:', proId);
                db.get().collection(collection.PRODUCT_COLLECTION)
                    .deleteOne({ _id: new objectId(proId) })
                    .then((response) => {
                        resolve(response);
                    })
                    .catch((err) => {
                        reject(err);
                    });
            } catch (err) {
                console.error('Error in deleteProduct:', err);
                reject(err);
            }
        });
    },

    getProductDetails: (proId) => {
        return new Promise((resolve, reject) => {
            try {
                if (!/^[0-9a-fA-F]{24}$/.test(proId)) {
                    throw new Error('Invalid ObjectId');
                }
                db.get().collection(collection.PRODUCT_COLLECTION)
                    .findOne({ _id: new objectId(proId) })
                    .then((product) => {
                        resolve(product);
                    })
                    .catch((err) => {
                        reject(err);
                    });
            } catch (err) {
                reject(err);
            }
        });
    },

    updateProduct: (proId, proDetails) => {
        return new Promise((resolve, reject) => {
            try {
                if (!/^[0-9a-fA-F]{24}$/.test(proId)) {
                    throw new Error('Invalid ObjectId');
                }
                if (!proDetails.Name || !proDetails.Category || !proDetails.Price || !proDetails.Description) {
                    throw new Error('All fields (Name, Category, Price, Description) are required');
                }
                const updateData = {
                    Name: proDetails.Name,
                    Description: proDetails.Description,
                    Price: proDetails.Price,
                    Category: proDetails.Category,
                    Specifications: proDetails.Specifications || {},
                    Reviews: proDetails.Reviews || []
                };
                if (proDetails.Image) {
                    updateData.Image = proDetails.Image;
                }
                if (proDetails.Images) {
                    updateData.Images = proDetails.Images;
                }

                db.get().collection(collection.PRODUCT_COLLECTION)
                    .updateOne(
                        { _id: new objectId(proId) },
                        { $set: updateData }
                    )
                    .then((response) => {
                        resolve(response);
                    })
                    .catch((err) => {
                        reject(err);
                    });
            } catch (err) {
                reject(err);
            }
        });
    },

    addUserReview: (proId, review, userId) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (!/^[0-9a-fA-F]{24}$/.test(proId) || !/^[0-9a-fA-F]{24}$/.test(userId)) {
                    throw new Error('Invalid ObjectId');
                }
                const product = await db.get().collection(collection.PRODUCT_COLLECTION)
                    .findOne({ _id: new objectId(proId) });
                if (!product) {
                    throw new Error('Product not found');
                }
                // Prevent duplicate reviews from the same user (simple check by username)
                if (product.Reviews.some(r => r.username === review.username)) {
                    throw new Error('You have already submitted a review for this product');
                }
                product.Reviews = product.Reviews || [];
                product.Reviews.push(review);
                await db.get().collection(collection.PRODUCT_COLLECTION)
                    .updateOne(
                        { _id: new objectId(proId) },
                        { $set: { Reviews: product.Reviews } }
                    );
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    },

    getProductRatingStats: (proId) => {
        return new Promise(async (resolve, reject) => {
            try {
                if (!/^[0-9a-fA-F]{24}$/.test(proId)) {
                    throw new Error('Invalid ObjectId');
                }
                const product = await db.get().collection(collection.PRODUCT_COLLECTION)
                    .findOne({ _id: new objectId(proId) });
                if (!product) {
                    throw new Error('Product not found');
                }
                const reviews = product.Reviews || [];
                const reviewCount = reviews.length;
                const averageRating = reviewCount > 0
                    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
                    : 0;
                resolve({ averageRating, reviewCount });
            } catch (err) {
                reject(err);
            }
        });
    }
};