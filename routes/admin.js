var express = require('express');
var router = express.Router();
var productHelpers = require('../helpers/product-helpers');
var orderHelpers = require('../helpers/order-helpers');
const db = require('../config/connection');
const collection = require('../config/collections');
const bcrypt = require('bcrypt');
const multer = require('multer');
const { ObjectId } = require('mongodb');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/product-images/');
    },
    filename: (req, file, cb) => {
        const filename = Date.now() + '-' + file.originalname;
        cb(null, filename);
    }
});
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG or PNG files are allowed'));
        }
    }
});

router.get('/', function(req, res, next) {
    productHelpers.getAllProducts().then((products) => {
        res.render('admin/view-products', { admin: true, products });
    }).catch((err) => {
        console.error(err);
        res.status(500).send('Error fetching products');
    });
});

router.get('/add-product', (req, res) => {
    res.render('admin/add-product');
});

router.post('/add-product', upload.single('Image'), (req, res) => {
    let product = req.body;
    if (!product.Name || !product.Category || !product.Price || !product.Description) {
        return res.status(400).send('All fields are required');
    }
    if (req.file) {
        product.Image = req.file.filename;
    }
    productHelpers.addProduct(product)
        .then(() => {
            res.redirect('/admin');
        })
        .catch((err) => {
            console.error('Error adding product:', err);
            res.status(500).send('Error adding product');
        });
});

router.get('/delete-product/:id', (req, res) => {
    let proId = req.params.id;
    if (!/^[0-9a-fA-F]{24}$/.test(proId)) {
        console.error('Invalid ObjectId:', proId);
        return res.status(400).send('Invalid product ID');
    }
    productHelpers.deleteProduct(proId).then((response) => {
        res.redirect('/admin/');
    }).catch((err) => {
        console.error(err);
        res.status(500).send('Error deleting product');
    });
});

router.get('/edit-product/:id', async (req, res) => {
    try {
        let product = await productHelpers.getProductDetails(req.params.id);
        res.render('admin/edit-product', { product });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching product details');
    }
});

router.post('/edit-product/:id', upload.single('Image'), (req, res) => {
    let id = req.params.id;
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
        console.error('Invalid ObjectId:', id);
        return res.status(400).send('Invalid product ID');
    }
    let proDetails = req.body;
    if (!proDetails.Name || !proDetails.Category || !proDetails.Price || !proDetails.Description) {
        return res.status(400).send('All fields are required');
    }
    if (req.file) {
        proDetails.Image = req.file.filename;
    } else if (proDetails.Image) {
        // Retain existing image
    }
    productHelpers.updateProduct(id, proDetails).then(() => {
        res.redirect('/admin');
    }).catch((err) => {
        console.error(err);
        res.status(500).send('Error updating product');
    });
});

router.get('/orders', async (req, res) => {
    try {
        const orders = await orderHelpers.getAllOrders();
        res.render('admin/orders', { admin: true, orders, error: null });
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.render('admin/orders', { admin: true, orders: [], error: 'Failed to load orders' });
    }
});

router.post('/ship-order/:id', async (req, res) => {
    try {
        await orderHelpers.shipOrder(req.params.id);
        res.json({ status: true, message: 'Order marked as shipped' });
    } catch (err) {
        console.error('Ship Order Error:', err);
        res.status(400).json({ status: false, error: err.message });
    }
});

router.post('/deliver-order/:id', async (req, res) => {
    try {
        await orderHelpers.deliverOrder(req.params.id);
        res.json({ status: true, message: 'Order marked as delivered' });
    } catch (err) {
        console.error('Deliver Order Error:', err);
        res.status(400).json({ status: false, error: err.message });
    }
});

router.get('/login', (req, res) => {
    if (req.session.adminLoggedIn) {
        res.redirect('/admin');
    } else {
        res.render('admin/login', { loginErr: req.session.loginErr });
        req.session.loginErr = false;
    }
});

router.post('/login', (req, res) => {
    const { Email, Password } = req.body;
    db.get().collection(collection.ADMIN_COLLECTION).findOne({ Email })
        .then(admin => {
            if (admin && bcrypt.compareSync(Password, admin.Password)) {
                req.session.adminLoggedIn = true;
                req.session.admin = admin;
                res.redirect('/admin');
            } else {
                req.session.loginErr = 'Invalid email or password';
                res.redirect('/admin/login');
            }
        })
        .catch(err => {
            console.error('Admin login error:', err);
            req.session.loginErr = 'Login failed';
            res.redirect('/admin/login');
        });
});

router.post('/add-admin', async (req, res) => {
    if (!req.session.admin || !req.session.admin.isSuperAdmin) {
        return res.status(403).json({ status: false, error: 'Super admin privileges required' });
    }
    const { Email, Password } = req.body;
    const hashedPassword = await bcrypt.hash(Password, 10);
    const adminObj = { Email, Password: hashedPassword, isSuperAdmin: false };
    try {
        await db.get().collection(collection.ADMIN_COLLECTION).insertOne(adminObj);
        res.json({ status: true, message: 'New admin added successfully' });
    } catch (err) {
        console.error('Add admin error:', err);
        res.status(500).json({ status: false, error: 'Failed to add admin' });
    }
});

router.get('/users', async (req, res) => {
    try {
        const users = await db.get().collection(collection.USER_COLLECTION).find({}, { projection: { name: 1, phone: 1, Email: 1, _id: 1 } }).toArray();
        res.render('admin/users', { admin: true, users, error: null });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.render('admin/users', { admin: true, users: [], error: 'Failed to load users' });
    }
});

router.get('/user-details/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await db.get().collection(collection.USER_COLLECTION).findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(404).render('admin/user-details', { admin: true, error: 'User not found' });
        }
        const orders = await orderHelpers.getUserOrders(userId);
        res.render('admin/user-details', { admin: true, user, orders, error: null });
    } catch (err) {
        console.error('Error fetching user details:', err);
        res.status(500).render('admin/user-details', { admin: true, error: 'Could not fetch user details' });
    }
});

module.exports = router; 