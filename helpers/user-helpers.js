const db = require("../config/connection");
const collection = require("../config/collections");
const bcrypt = require("bcrypt");
const { ObjectId } = require("mongodb");

module.exports = {
  doSignup: async (userData) => {
    userData.Email = userData.Email.toLowerCase();
    userData.Password = await bcrypt.hash(userData.Password, 10);
    const data = await db.get().collection(collection.USER_COLLECTION).insertOne(userData);
    return data.insertedId;
  },

  doLogin: async (userData) => {
    if (!userData || !userData.Email || !userData.Password) {
      return { status: false, error: "Missing credentials" };
    }

    const email = userData.Email.toLowerCase();
    const user = await db.get().collection(collection.USER_COLLECTION).findOne({ Email: email });

    if (!user) {
      return { status: false, errorType: "username" };
    }

    const status = await bcrypt.compare(userData.Password, user.Password);
    if (!status) {
      return { status: false, errorType: "password" };
    }

    return { status: true, user };
  },

  addToCart: async (proId, userId) => {
    let userObjectId, productObjectId;
    try {
      userObjectId = new ObjectId(userId);
      productObjectId = new ObjectId(proId);
    } catch (err) {
      console.error("Invalid ID error:", err.message);
      return { status: false, error: "Invalid user or product ID" };
    }

    const proObj = {
      item: productObjectId,
      quantity: 1
    };

    const userCart = await db.get().collection(collection.CART_COLLECTION).findOne({ user: userObjectId });

    if (userCart) {
      const proExist = userCart.products.findIndex(
        p => p.item && p.item.toString() === proId
      );

      if (proExist !== -1) {
        await db.get().collection(collection.CART_COLLECTION).updateOne(
          { user: userObjectId, "products.item": productObjectId },
          {
            $inc: { "products.$[elem].quantity": 1 }
          },
          { arrayFilters: [{ "elem.item": productObjectId }] }
        );
      } else {
        await db.get().collection(collection.CART_COLLECTION).updateOne(
          { user: userObjectId },
          {
            $push: { products: proObj }
          }
        );
      }
    } else {
      const cartObj = {
        user: userObjectId,
        products: [proObj]
      };
      await db.get().collection(collection.CART_COLLECTION).insertOne(cartObj);
    }

    const cartCount = await db.get().collection(collection.CART_COLLECTION).aggregate([
      { $match: { user: userObjectId } },
      { $project: { totalQuantity: { $sum: "$products.quantity" } } }
    ]).toArray();

    return {
      status: true,
      cartCount: cartCount[0]?.totalQuantity || 0
    };
  },

  createCartIfNotExists: async (userId) => {
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (err) {
      throw new Error('Invalid user ID');
    }

    const cart = await db.get().collection(collection.CART_COLLECTION).findOne({ user: userObjectId });
    if (!cart) {
      const cartObj = { user: userObjectId, products: [] };
      const result = await db.get().collection(collection.CART_COLLECTION).insertOne(cartObj);
      return result.insertedId.toString();
    }
    return cart._id.toString();
  },

  getCartProducts: async (userId) => {
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (err) {
      console.error("Invalid user ID error:", err.message);
      return [];
    }

    const cart = await db.get().collection(collection.CART_COLLECTION).findOne({ user: userObjectId });
    if (!cart) {
      await module.exports.createCartIfNotExists(userId);
    }

    const cartItems = await db.get().collection(collection.CART_COLLECTION).aggregate([
      {
        $match: { user: userObjectId }
      },
      {
        $unwind: "$products"
      },
      {
        $lookup: {
          from: collection.PRODUCT_COLLECTION,
          localField: "products.item",
          foreignField: "_id",
          as: "cartItem"
        }
      },
      {
        $unwind: "$cartItem"
      },
      {
        $project: {
          _id: 0,
          item: "$products.item",
          quantity: "$products.quantity",
          product: "$cartItem"
        }
      }
    ]).toArray();

    return cartItems || [];
  },

  getCartCount: async (userId) => {
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (err) {
      return 0;
    }

    const cart = await db.get().collection(collection.CART_COLLECTION).findOne({ user: userObjectId });

    if (!cart || !cart.products || !cart.products.length) return 0;

    return cart.products.reduce((acc, item) => acc + (item.quantity || 0), 0);
  },

  updateCartQuantity: async (details) => {
    let cartId, productId, userObjectId;
    try {
      cartId = new ObjectId(details.cart);
      productId = new ObjectId(details.product);
      userObjectId = new ObjectId(details.userId);
    } catch (err) {
      console.error("Invalid ID error:", err.message);
      throw new Error('Invalid cart, product, or user ID');
    }

    console.log("Updating quantity:", cartId, productId, "for user:", userObjectId);

    let cart = await db.get().collection(collection.CART_COLLECTION).findOne({ _id: cartId });
    if (!cart) {
      console.warn("Cart not found for ID:", cartId, "Fetching by user...");
      cart = await db.get().collection(collection.CART_COLLECTION).findOne({ user: userObjectId });
      if (!cart) {
        console.warn("No cart found for user, creating new cart...");
        const newCartId = await module.exports.createCartIfNotExists(details.userId);
        cartId = new ObjectId(newCartId);
        cart = await db.get().collection(collection.CART_COLLECTION).findOne({ _id: cartId });
      }
    }

    const updateResult = await db.get().collection(collection.CART_COLLECTION).updateOne(
      { _id: cartId, "products.item": productId },
      {
        $inc: { "products.$[elem].quantity": details.count }
      },
      {
        arrayFilters: [{ "elem.item": productId }],
        upsert: false
      }
    );

    console.log("Update result:", updateResult);

    if (updateResult.matchedCount === 0) {
      throw new Error('No matching cart item found');
    }

    if (details.count < 0) {
      const updatedCart = await db.get().collection(collection.CART_COLLECTION).findOne({ _id: cartId });
      const item = updatedCart.products.find(p => p.item.toString() === productId.toString());
      if (item && item.quantity < 1) {
        await db.get().collection(collection.CART_COLLECTION).updateOne(
          { _id: cartId },
          { $pull: { products: { item: productId } } }
        );
        console.log("Product removed from cart due to quantity below 1");
      }
    }

    const updatedItem = await db.get().collection(collection.CART_COLLECTION).findOne(
      { _id: cartId, "products.item": productId },
      { projection: { "products.$": 1 } }
    );
    const newQuantity = updatedItem?.products[0]?.quantity || 0;

    return { success: true, message: 'Product quantity updated successfully', quantity: newQuantity };
  },

  removeCartItem: async (cartId, proId, userId) => {
    let cartObjectId, productObjectId, userObjectId;
    try {
      cartObjectId = new ObjectId(cartId);
      productObjectId = new ObjectId(proId);
      userObjectId = new ObjectId(userId);
    } catch (err) {
      console.error("Invalid ID error:", err.message);
      throw new Error('Invalid cart, product, or user ID');
    }

    console.log("Removing product:", cartObjectId, productObjectId, "for user:", userObjectId);

    let cart = await db.get().collection(collection.CART_COLLECTION).findOne({ _id: cartObjectId });
    if (!cart) {
      console.warn("Cart not found for ID:", cartObjectId, "Fetching by user...");
      cart = await db.get().collection(collection.CART_COLLECTION).findOne({ user: userObjectId });
      if (!cart) {
        console.warn("No cart found for user, creating new cart...");
        const newCartId = await module.exports.createCartIfNotExists(userId);
        cartObjectId = new ObjectId(newCartId);
        cart = await db.get().collection(collection.CART_COLLECTION).findOne({ _id: cartObjectId });
      }
    }

    const productInCart = cart.products.find(p => p.item.toString() === productObjectId.toString());
    if (!productInCart) {
      console.error("Product not found in cart for ID:", productObjectId);
      throw new Error('Product not found in cart');
    }

    console.log("Product found in cart:", productInCart);

    const result = await db.get().collection(collection.CART_COLLECTION).updateOne(
      { _id: cartObjectId },
      { $pull: { products: { item: productObjectId } } }
    );

    console.log("Delete result:", result);

    if (result.matchedCount === 0) {
      throw new Error('No matching cart item found');
    }

    return { success: true, message: 'Product removed from cart' };
  }
};