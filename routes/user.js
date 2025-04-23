var express = require('express');
var router = express.Router();
const productHelpers = require('../helpers/product-helpers');
const userHelpers = require('../helpers/user-helpers');
const { ObjectId } = require('mongodb');
const collection = require('../config/collections');
const db = require('../config/connection');
const orderHelpers = require('../helpers/order-helpers');
const razorpayInstance = require('../config/razorpay');

router.userHelpers = userHelpers;

const verifyLogin = (req, res, next) => {
    console.log('verifyLogin middleware: session.loggedIn =', req.session.loggedIn, 'session.user =', req.session.user);
    if (req.session.loggedIn && req.session.user) {
        next();
    } else {
        const redirectUrl = req.originalUrl || '/';
        console.log('User not logged in, redirecting to /login with redirectUrl:', redirectUrl);
        res.redirect(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
    }
};

router.post('/create-razorpay-order', verifyLogin, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cartProducts = await userHelpers.getCartProducts(userId);

        if (!cartProducts.length) {
            return res.status(400).json({ status: false, error: 'Cart is empty' });
        }

        let subtotal = 0;
        cartProducts.forEach(item => {
            subtotal += Number(item.product.Price) * item.quantity;
        });

        const shipping = 0;
        const tax = Math.round(subtotal * 0.00);
        const total = subtotal + shipping + tax;

        const order = await razorpayInstance.orders.create({
            amount: total * 100,
            currency: 'INR',
            receipt: `receipt_${new ObjectId()}`,
        });

        res.json({
            status: true,
            key: process.env.RAZORPAY_KEY_ID,
            orderId: order.id,
            amount: order.amount
        });
    } catch (err) {
        console.error('Create Razorpay Order Error:', err);
        res.status(500).json({ status: false, error: 'Failed to create Razorpay order' });
    }
});

router.get('/', async function (req, res) {
    let user = req.session.user;
    let cartCount = null;

    if (user) {
        cartCount = await userHelpers.getCartCount(user._id);
    }

    productHelpers.getAllProducts().then((products) => {
        console.log('Rendering view-products, user:', user);
        res.render('user/view-products', { products, user, cartCount });
    });
});

router.get('/login', (req, res) => {
    if (req.session.loggedIn && req.session.user) {
        console.log('User already logged in, redirecting to /');
        res.redirect('/');
    } else {
        console.log('Rendering login page with redirect:', req.query.redirect);
        res.render('user/login', {
            usernameErr: req.session.usernameErr,
            passwordErr: req.session.passwordErr,
            redirect: req.query.redirect || '/'
        });
        req.session.usernameErr = false;
        req.session.passwordErr = false;
    }
});

router.get('/signup', (req, res) => {
    if (req.session.loggedIn && req.session.user) {
        res.redirect('/');
    } else {
        res.render('user/signup');
    }
});

router.post('/signup', (req, res) => {
    userHelpers
        .doSignup(req.body)
        .then((id) => {
            res.redirect('/login');
        })
        .catch((err) => {
            console.error('Signup error:', err);
            res.status(500).send('Signup failed');
        });
});

router.post('/login', (req, res) => {
    userHelpers
        .doLogin(req.body)
        .then((response) => {
            if (response.status) {
                req.session.loggedIn = true;
                req.session.user = response.user;
                const redirectUrl = req.query.redirect || '/';
                console.log('Login successful, redirecting to:', redirectUrl);
                res.redirect(decodeURIComponent(redirectUrl));
            } else {
                if (response.errorType === 'username') {
                    req.session.usernameErr = true;
                } else if (response.errorType === 'password') {
                    req.session.passwordErr = true;
                }
                const redirectUrl = req.query.redirect || '/';
                res.redirect(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
            }
        })
        .catch((err) => {
            console.error('Login error:', err);
            const redirectUrl = req.query.redirect || '/';
            res.redirect(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
        });
});

router.get('/logout', (req, res) => {
    console.log('Logging out, destroying session');
    req.session.destroy();
    res.redirect('/');
});

router.get('/cart', verifyLogin, async (req, res) => {
    try {
        const userId = req.session.user._id;
        if (!ObjectId.isValid(userId)) {
            throw new Error('Invalid user ID');
        }

        const cartId = await userHelpers.createCartIfNotExists(userId);
        const cartProducts = await userHelpers.getCartProducts(userId);

        let subtotal = 0;
        cartProducts.forEach(item => {
            subtotal += Number(item.product.Price) * item.quantity;
        });

        const shipping = 0;
        const tax = Math.round(subtotal * 0.00);
        const total = subtotal + shipping + tax;

        const userDoc = await db.get().collection(collection.USER_COLLECTION).findOne({ _id: new ObjectId(userId) });
        const savedAddress = userDoc?.shippingAddress || null;

        res.render('user/cart', {
            user: req.session.user,
            products: cartProducts,
            cartId: cartId,
            cartSummary: { subtotal, shipping, tax, total },
            isEmpty: cartProducts.length === 0,
            savedAddress
        });
    } catch (err) {
        console.error('Cart Route Error:', err.stack);
        res.render('user/cart', {
            user: req.session.user,
            products: [],
            cartSummary: { subtotal: 0, shipping: 0, tax: 0, total: 0 },
            isEmpty: true,
            savedAddress: null,
            error: 'Failed to load cart. Please try again later.'
        });
    }
});

router.get('/add-to-cart/:id', verifyLogin, async (req, res) => {
    console.log('Add to cart route hit for product ID:', req.params.id, 'by user:', req.session.user?._id);
    try {
        await userHelpers.addToCart(req.params.id, req.session.user._id);
        res.json({ status: true });
    } catch (err) {
        console.error('Add to Cart Error:', err);
        res.status(500).json({ status: false, error: err.message });
    }
});

router.post('/change-product-quantity', verifyLogin, async (req, res) => {
    try {
        const { cart, product, count, userId } = req.body;
        const result = await userHelpers.updateCartQuantity({ cart, product, count, userId });
        res.json(result);
    } catch (err) {
        console.error('Quantity Update Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/remove-cart-product', verifyLogin, async (req, res) => {
    try {
        const { cart, product, userId } = req.body;
        const result = await userHelpers.removeCartItem(cart, product, userId);
        res.json(result);
    } catch (err) {
        console.error('Remove Product Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/save-shipping-address', verifyLogin, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const shippingData = req.body;

        if (!shippingData || !shippingData.shippingName || !shippingData.shippingAddress1) {
            return res.status(400).json({ status: false, error: 'Incomplete address data' });
        }

        await db.get().collection(collection.USER_COLLECTION).updateOne(
            { _id: new ObjectId(userId) },
            { $set: { shippingAddress: shippingData } },
            { upsert: true }
        );

        res.json({ status: true, message: 'Shipping address saved successfully' });
    } catch (err) {
        console.error('Save Shipping Address Error:', err);
        res.status(500).json({ status: false, error: err.message });
    }
});

router.get('/checkout', verifyLogin, async (req, res) => {
    try {
        const userId = req.session.user._id;

        const userDoc = await db.get().collection(collection.USER_COLLECTION).findOne({ _id: new ObjectId(userId) });
        const savedAddress = userDoc?.shippingAddress;

        const cartProducts = await userHelpers.getCartProducts(userId);

        let subtotal = 0;
        cartProducts.forEach(item => {
            subtotal += Number(item.product.Price) * item.quantity;
        });

        const shipping = 0;
        const tax = Math.round(subtotal * 0.00);
        const total = subtotal + shipping + tax;

        res.render('user/checkout', {
            user: req.session.user,
            savedAddress,
            products: cartProducts,
            cartSummary: { subtotal, shipping, tax, total }
        });
    } catch (err) {
        console.error('Checkout Error:', err);
        res.render('user/checkout', {
            user: req.session.user,
            products: [],
            cartSummary: { subtotal: 0, shipping: 0, tax: 0, total: 0 },
            savedAddress: null,
            error: 'Something went wrong during checkout.'
        });
    }
});

router.get('/place-order', verifyLogin, async (req, res) => {
    try {
        const userId = req.session.user._id;

        const userDoc = await db.get().collection(collection.USER_COLLECTION).findOne({ _id: new ObjectId(userId) });
        const savedAddress = userDoc?.shippingAddress;

        const cartProducts = await userHelpers.getCartProducts(userId);

        let subtotal = 0;
        cartProducts.forEach(item => {
            subtotal += Number(item.product.Price) * item.quantity;
        });

        const shipping = 0;
        const tax = Math.round(subtotal * 0.00);
        const total = subtotal + shipping + tax;

        res.render('user/place-order', {
            user: req.session.user,
            savedAddress,
            products: cartProducts,
            cartSummary: { subtotal, shipping, tax, total }
        });
    } catch (err) {
        console.error('Place Order Page Error:', err);
        res.redirect('/cart');
    }
});

router.post('/submit-order', verifyLogin, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { paymentMethod, razorpayPaymentId } = req.body;

        const cartProducts = await userHelpers.getCartProducts(userId);
        if (!cartProducts.length) {
            return res.status(400).json({ status: false, error: 'Cart is empty' });
        }

        const userDoc = await db.get().collection(collection.USER_COLLECTION).findOne({ _id: new ObjectId(userId) });
        const shippingAddress = userDoc?.shippingAddress;
        const userInfo = userDoc ? { name: userDoc.name, email: userDoc.email, phone: userDoc.phone } : {};

        let subtotal = 0;
        cartProducts.forEach(item => {
            subtotal += Number(item.product.Price) * item.quantity;
        });

        const shipping = 0;
        const tax = Math.round(subtotal * 0.00);
        const total = subtotal + shipping + tax;

        let orderStatus = 'Pending';

        if (paymentMethod === 'RAZORPAY' && razorpayPaymentId) {
            const payment = await razorpayInstance.payments.fetch(razorpayPaymentId);
            if (payment.status === 'captured') {
                orderStatus = 'Placed';
            } else {
                return res.status(400).json({ status: false, error: 'Payment not completed' });
            }
        } else if (paymentMethod === 'COD') {
            orderStatus = 'Placed';
        }

        const orderObj = {
            userId: new ObjectId(userId),
            userInfo: userInfo,
            products: cartProducts,
            shippingAddress,
            paymentMethod,
            razorpayPaymentId: paymentMethod === 'RAZORPAY' ? razorpayPaymentId : null,
            totalAmount: total,
            status: orderStatus,
            date: new Date()
        };

        const order = await db.get().collection(collection.ORDER_COLLECTION).insertOne(orderObj);

        await db.get().collection(collection.CART_COLLECTION).deleteOne({ user: new ObjectId(userId) });

        res.json({ status: true, orderId: order.insertedId });
    } catch (err) {
        console.error('Order Submission Error:', err);
        res.status(500).json({ status: false, error: 'Server error while placing order' });
    }
});

router.get('/thank-you', verifyLogin, (req, res) => {
    res.render('user/thank-you', { user: req.session.user });
});

router.get('/orders', verifyLogin, async (req, res) => {
    try {
        const orders = await orderHelpers.getUserOrders(req.session.user._id);
        res.render('user/orders', { user: req.session.user, orders, error: null });
    } catch (err) {
        console.error('Fetch Orders Error:', err);
        res.render('user/orders', { user: req.session.user, orders: [], error: 'Could not fetch orders.' });
    }
});

router.get('/order-details/:id', verifyLogin, async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await db.get().collection(collection.ORDER_COLLECTION).findOne({ _id: new ObjectId(orderId) });

        if (!order) {
            return res.status(404).render('user/order-details', { user: req.session.user, error: 'Order not found' });
        }

        res.render('user/order-details', { user: req.session.user, order });
    } catch (err) {
        console.error('Order Details Error:', err);
        res.status(500).render('user/order-details', { user: req.session.user, error: 'Could not fetch order details.' });
    }
});

router.get('/product-details/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await productHelpers.getProductDetails(productId);

        if (!product) {
            return res.status(404).render('user/product-details', { error: 'Product not found' });
        }

        res.render('user/product-details', { product, user: req.session.user });
    } catch (err) {
        console.error('Product Details Error:', err);
        res.status(500).render('user/product-details', { error: 'Could not fetch product details.' });
    }
});

router.get('/profile', verifyLogin, async (req, res) => {
    try {
        const userId = req.session.user._id;
        const user = await db.get().collection(collection.USER_COLLECTION).findOne({ _id: new ObjectId(userId) });

        if (!user) {
            return res.status(404).render('user/profile', { user: req.session.user, error: 'User not found' });
        }

        res.render('user/profile', { user });
    } catch (err) {
        console.error('Profile Error:', err);
        res.status(500).render('user/profile', { user: req.session.user, error: 'Could not fetch profile.' });
    }
});

router.post('/cancel-order/:id', verifyLogin, async (req, res) => {
    const orderId = req.params.id;
    const userId = req.session.user._id;
    try {
        const success = await orderHelpers.cancelOrder(orderId, userId);
        if (success) {
            res.json({ status: true, message: 'Order cancelled successfully' });
        } else {
            res.json({ status: false, message: 'Unable to cancel order' });
        }
    } catch (err) {
        console.error('Cancel Order Error:', err);
        res.status(500).json({ status: false, message: 'Server error' });
    }
});

module.exports = router;