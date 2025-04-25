import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import AddReview from './components/AddReview';

const App = () => {
    return (
        <Router>
            <Routes>
                <Route path="/admin/add-review/:id" element={<AddReview />} />
            </Routes>
        </Router>
    );
};

export default App;