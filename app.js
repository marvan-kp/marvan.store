require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var userRouter = require('./routes/user');
var adminRouter = require('./routes/admin');
const exphbs = require('express-handlebars');
var db = require('./config/connection');
var app = express();
var session = require('express-session');
const Handlebars = require('handlebars');

// Verify environment variables
console.log('RAZORPAY_KEY_ID from app.js:', process.env.RAZORPAY_KEY_ID);
console.log('RAZORPAY_KEY_SECRET from app.js:', process.env.RAZORPAY_KEY_SECRET);

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.engine('hbs', exphbs.engine({
    extname: 'hbs',
    defaultLayout: 'layout',
    layoutsDir: path.join(__dirname, 'views/layout'),
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
        multiply: (a, b) => a * b,
        ifEquals: function(a, b, options) {
            if (a === b) {
                return options.fn(this);
            } else {
                return options.inverse(this);
            }
        },
        json: context => JSON.stringify(context, null, 2),
        formatDate: (date) => new Date(date).toLocaleDateString()
    },
    handlebars: Handlebars
}));
console.log('Registered helpers:', Object.keys(Handlebars.helpers));
app.use(logger('dev'));
app.use('/public', express.static('public'));
app.use('/product-images', express.static(path.join(__dirname, 'public/product-images')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: "Key",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 600000 }
}));
db.connect((err) => {
    if (err) console.log('Connection error');
    else console.log('Database connection successful');
});
app.use(async (req, res, next) => {
    if (req.session.user && req.session.user._id) {
        try {
            res.locals.cartCount = await userRouter.userHelpers.getCartCount(req.session.user._id);
        } catch (err) {
            res.locals.cartCount = 0;
        }
    } else {
        res.locals.cartCount = 0;
    }
    if (req.path.startsWith('/admin') && !req.path.startsWith('/admin/login') && !req.session.adminLoggedIn) {
        return res.redirect('/admin/login');
    }
    res.locals.adminLoggedIn = req.session.adminLoggedIn || false;
    next();
});

app.use('/', userRouter);
app.use('/admin', adminRouter);

app.get('/admin/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Logout failed');
        }
        res.redirect('/admin/login');
    });
});

app.use(function(req, res, next) {
    next(createError(404));
});

app.use(function(err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;