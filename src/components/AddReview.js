import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const AddReview = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [error, setError] = useState(null);
    const [username, setUsername] = useState('');
    const [rating, setRating] = useState('');
    const [comment, setComment] = useState('');

    useEffect(() => {
        fetch(`/admin/api/product/${id}`, { credentials: 'include' })
            .then(response => response.json())
            .then(data => {
                if (data.status) {
                    setProduct(data.product);
                } else {
                    setError(data.error);
                }
            })
            .catch(err => {
                setError('Failed to load product details');
            });
    }, [id]);

    const handleSubmit = (e) => {
        e.preventDefault();
        fetch(`/admin/api/add-review/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, rating, comment }),
            credentials: 'include'
        })
            .then(response => response.json())
            .then(data => {
                if (data.status) {
                    alert('Review added successfully!');
                    navigate('/admin');
                } else {
                    setError(data.error);
                }
            })
            .catch(err => {
                setError('Failed to submit review');
            });
    };

    if (error) {
        return <div className="alert alert-danger">{error}</div>;
    }

    if (!product) {
        return <div>Loading...</div>;
    }

    return (
        <div className="container mt-4">
            <h2 className="text-center">Add Review for {product.Name}</h2>
            <form onSubmit={handleSubmit}>
                <div className="mb-3">
                    <label htmlFor="username" className="form-label">Username</label>
                    <input
                        type="text"
                        className="form-control"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
                </div>
                <div className="mb-3">
                    <label htmlFor="rating" className="form-label">Rating (1-5)</label>
                    <input
                        type="number"
                        className="form-control"
                        id="rating"
                        min="1"
                        max="5"
                        value={rating}
                        onChange={(e) => setRating(e.target.value)}
                        required
                    />
                </div>
                <div className="mb-3">
                    <label htmlFor="comment" className="form-label">Comment</label>
                    <textarea
                        className="form-control"
                        id="comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        required
                    ></textarea>
                </div>
                <button type="submit" className="btn btn-primary">Submit Review</button>
            </form>
        </div>
    );
};

export default AddReview;