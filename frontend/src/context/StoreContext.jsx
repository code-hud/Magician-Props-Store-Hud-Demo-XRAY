import React, { createContext, useContext, useState, useEffect } from 'react';
import * as api from '../api/client';

const StoreContext = createContext();

export const StoreProvider = ({ children }) => {
  const [sessionId, setSessionId] = useState(null);
  const [cart, setCart] = useState([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  // Initialize session ID
  useEffect(() => {
    const storedSessionId = localStorage.getItem('sessionId');
    const newSessionId = storedSessionId || generateSessionId();
    setSessionId(newSessionId);
    localStorage.setItem('sessionId', newSessionId);
  }, []);

  // Fetch products on mount
  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  // Fetch cart when session ID changes
  useEffect(() => {
    if (sessionId) {
      fetchCart();
    }
  }, [sessionId]);

  const generateSessionId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const fetchProducts = async (search = '', category = '') => {
    try {
      setLoading(true);
      const response = await api.getProducts(search, category);
      // Sort by popularity (timesOrdered) descending
      const sortedProducts = [...response.data].sort((a, b) => (b.timesOrdered || 0) - (a.timesOrdered || 0));
      setProducts(sortedProducts);
      setCurrentPage(1);
      setError(null);
    } catch (err) {
      const errorData = {
        message: 'Failed to fetch products',
        type: err.response?.status >= 500 ? 'server' : 'client',
        status: err.response?.status,
      };
      setError(errorData);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.getCategories();
      setCategories(response.data);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const fetchCart = async () => {
    if (!sessionId) return;
    try {
      const response = await api.getCart(sessionId);
      setCart(response.data);
      const totalResponse = await api.getCartTotal(sessionId);
      setCartTotal(totalResponse.data.total);
    } catch (err) {
      console.error('Failed to fetch cart:', err);
    }
  };

  const addProductToCart = async (productId, quantity = 1) => {
    if (!sessionId) return;
    try {
      await api.addToCart(sessionId, productId, quantity);
      await fetchCart();
    } catch (err) {
      console.log('Error caught in addProductToCart:', err);
      console.log('Error response:', err.response);
      console.log('Error status:', err.response?.status);
      const errorData = {
        message: 'Failed to add to cart',
        type: err.response?.status >= 500 ? 'server' : 'client',
        status: err.response?.status,
        details: err.response?.data?.message || err.message
      };
      console.log('Setting error state:', errorData);
      console.log('setError function:', typeof setError);
      window.lastError = errorData;
      window.errorCounter = (window.errorCounter || 0) + 1;
      setError(errorData);
      console.log('Error state after setError, should update next render');
      console.error(err);
      return;
    }
  };

  const removeProductFromCart = async (productId) => {
    if (!sessionId) return;
    try {
      await api.removeFromCart(sessionId, productId);
      await fetchCart();
    } catch (err) {
      const errorData = {
        message: 'Failed to remove from cart',
        type: err.response?.status >= 500 ? 'server' : 'client',
        status: err.response?.status,
      };
      setError(errorData);
      console.error(err);
    }
  };

  const checkoutOrder = async (customerName, customerEmail, customerPhone) => {
    if (!sessionId) return null;
    try {
      const items = cart.map(item => ({
        productId: item.product_id,
        quantity: item.quantity,
        price: item.product.price,
      }));
      const response = await api.createOrder(
        sessionId,
        customerName,
        customerEmail,
        customerPhone,
        cartTotal,
        items,
      );
      setCart([]);
      setCartTotal(0);
      return response.data;
    } catch (err) {
      const errorData = {
        message: 'Failed to create order',
        type: err.response?.status >= 500 ? 'server' : 'client',
        status: err.response?.status,
      };
      setError(errorData);
      console.error(err);
      throw err;
    }
  };

  // Pagination helpers
  const totalPages = Math.ceil(products.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = products.slice(startIndex, endIndex);

  const goToPage = (pageNumber) => {
    const validPage = Math.max(1, Math.min(pageNumber, totalPages));
    setCurrentPage(validPage);
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const value = {
    sessionId,
    cart,
    cartTotal,
    products,
    paginatedProducts,
    categories,
    loading,
    error,
    setError,
    fetchProducts,
    addProductToCart,
    removeProductFromCart,
    checkoutOrder,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    nextPage,
    prevPage,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within StoreProvider');
  }
  return context;
};
