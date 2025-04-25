var express = require('express');
var router = express.Router();
var productHelpers = require('../helpers/product-helpers');
var orderHelpers = require('../helpers/order-helpers');
const db = require('../config/connection');
const collection = require('../config/collections');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = './public/product-images/';
        try {
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
                console.log('Created upload directory:', uploadPath);
            }
            cb(null, uploadPath);
        } catch (err) {
            console.error('Error creating upload directory:', err);
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        try {
            const filename = Date.now() + '-' + file.originalname;
            console.log('Saving file as:', filename);
            cb(null, filename);
        } catch (err) {
            console.error('Error generating filename:', err);
            cb(err);
        }
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
            console.log('File type accepted:', file.mimetype);
            cb(null, true);
        } else {
            console.error('Invalid file type:', file.mimetype);
            cb(new Error('Only JPEG or PNG files are allowed'), false);
        }
    }
}).array('Images', 5);

router.get('/', function(req, res, next) {
    productHelpers.getAllProducts().then((products) => {
        res.render('admin/view-products', { admin: true, products });
    }).catch((err) => {
        console.error('Error fetching products:', err);
        res.status(500).send('Error fetching products');
    });
});

router.get('/add-product', (req, res) => {
    res.render('admin/add-product', { error: req.session.addProductError });
    req.session.addProductError = null;
});

router.post('/add-product', async (req, res) => {
    try {
        console.log('Starting file upload...');
        upload(req, res, async (err) => {
            if (err) {
                console.error('Upload error:', err.message, err.stack);
                req.session.addProductError = `Image upload failed: ${err.message}`;
                return res.redirect('/admin/add-product');
            }

            try {
                console.log('Upload successful, files:', req.files);
                let product = req.body;
                console.log('Product data:', product);

                if (!product.Name || !product.Category || !product.Price || !product.Description) {
                    req.session.addProductError = 'All fields (Name, Category, Price, Description) are required';
                    return res.redirect('/admin/add-product');
                }

                if (req.files && req.files.length > 0) {
                    product.Image = req.files[0].filename;
                    product.Images = req.files.map(file => file.filename);
                    console.log('Images assigned:', product.Images);
                } else {
                    product.Image = 'default-image.jpg';
                    product.Images = ['default-image.jpg'];
                    console.warn('No images uploaded, using default image');
                }

                const specsArray = product.Specifications || [];
                product.Specifications = {};
                specsArray.forEach(spec => {
                    if (spec.name && spec.value) {
                        product.Specifications[spec.name] = spec.value;
                    }
                });

                product.Reviews = [];

                console.log('Adding product to database:', product);
                await productHelpers.addProduct(product);
                console.log('Product added successfully');
                res.redirect('/admin');
            } catch (err) {
                console.error('Error adding product:', err.message, err.stack);
                req.session.addProductError = 'Failed to add product: ' + err.message;
                res.redirect('/admin/add-product');
            }
        });
    } catch (err) {
        console.error('Outer error in /add-product:', err.message, err.stack);
        req.session.addProductError = 'Unexpected error: ' + err.message;
        res.redirect('/admin/add-product');
    }
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
        console.log('Product data for edit:', product); // Debug log
        if (!product) {
            return res.status(404).send('Product not found');
        }
        res.render('admin/edit-product', { product });
    } catch (err) {
        console.error('Error fetching product details:', err);
        res.status(500).send('Error fetching product details');
    }
});

router.post('/edit-product/:id', (req, res) => {
    let id = req.params.id;
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
        console.error('Invalid ObjectId:', id);
        return res.status(400).send('Invalid product ID');
    }
    upload(req, res, async (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.status(400).render('admin/edit-product', { product: req.body, error: err.message });
        }
        let proDetails = req.body;
        if (!proDetails.Name || !proDetails.Category || !proDetails.Price || !proDetails.Description) {
            return res.status(400).render('admin/edit-product', { product: proDetails, error: 'All fields (Name, Category, Price, Description) are required' });
        }
        if (req.files && req.files.length > 0) {
            proDetails.Image = req.files[0].filename;
            proDetails.Images = req.files.map(file => file.filename);
        } else if (proDetails.Image) {
            // Retain existing image if no new upload
        }

        const specsArray = proDetails.Specifications || [];
        proDetails.Specifications = {};
        specsArray.forEach(spec => {
            if (spec.name && spec.value) {
                proDetails.Specifications[spec.name] = spec.value;
            }
        });

        try {
            await productHelpers.updateProduct(id, proDetails);
            res.redirect('/admin');
        } catch (err) {
            console.error('Error updating product:', err);
            res.status(500).render('admin/edit-product', { product: proDetails, error: 'Failed to update product' });
        }
    });
});

router.get('/add-review/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
            return res.status(400).send('Invalid product ID');
        }
        const product = await productHelpers.getProductDetails(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }
        res.render('admin/add-review', { product, error: req.session.addReviewError });
        req.session.addReviewError = null;
    } catch (err) {
        console.error('Error fetching product for review:', err);
        res.status(500).send('Error fetching product for review');
    }
});

router.post('/add-review/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
            return res.status(400).send('Invalid product ID');
        }
        const { username, rating, comment } = req.body;
        if (!username || !rating || !comment) {
            req.session.addReviewError = 'All fields (Username, Rating, Comment) are required';
            return res.redirect(`/admin/add-review/${productId}`);
        }
        const review = {
            username,
            rating: parseInt(rating),
            comment,
            date: new Date().toISOString()
        };
        const product = await productHelpers.getProductDetails(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }
        product.Reviews = product.Reviews || [];
        product.Reviews.push(review);
        await productHelpers.updateProduct(productId, product);
        res.redirect('/admin');
    } catch (err) {
        console.error('Error adding review:', err);
        req.session.addReviewError = 'Failed to add review: ' + err.message;
        res.redirect(`/admin/add-review/${req.params.id}`);
    }
});

router.get('/api/product/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }
        const product = await productHelpers.getProductDetails(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ status: true, product });
    } catch (err) {
        console.error('Error fetching product for review:', err);
        res.status(500).json({ error: 'Error fetching product for review' });
    }
});

router.post('/api/add-review/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        if (!/^[0-9a-fA-F]{24}$/.test(productId)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }
        const { username, rating, comment } = req.body;
        if (!username || !rating || !comment) {
            return res.status(400).json({ error: 'All fields (Username, Rating, Comment) are required' });
        }
        const review = {
            username,
            rating: parseInt(rating),
            comment,
            date: new Date().toISOString()
        };
        const product = await productHelpers.getProductDetails(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        product.Reviews = product.Reviews || [];
        product.Reviews.push(review);
        await productHelpers.updateProduct(productId, product);
        res.json({ status: true, message: 'Review added successfully' });
    } catch (err) {
        console.error('Error adding review:', err);
        res.status(500).json({ error: 'Failed to add review' });
    }
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
        return res.status(400).json({ status: false, error: 'Super admin privileges required' });
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