import axios from 'axios';
import fs from 'fs';
import path from 'path';

const PINTEREST_API_URL = 'https://api.pinterest.com/v5';

// Helper to get headers
const getHeaders = (accessToken) => ({
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
});

// Validate Token and get User Info
export const validateToken = async (accessToken) => {
    try {
        const response = await axios.get(`${PINTEREST_API_URL}/user_account`, {
            headers: getHeaders(accessToken)
        });

        // Extract scopes from headers
        const scopes = response.headers['x-user-scope'] || '';
        console.log('[PINTEREST] Token Scopes:', scopes);

        return { success: true, user: response.data, scopes: scopes };
    } catch (error) {
        console.error('Pinterest Auth Error Details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.response?.headers
        });
        return { success: false, error: error.response?.data?.message || error.message };
    }
};

// Get User Boards
export const getBoards = async (accessToken) => {
    try {
        const response = await axios.get(`${PINTEREST_API_URL}/boards`, {
            headers: getHeaders(accessToken),
            params: {
                page_size: 100
            }
        });
        return { success: true, boards: response.data.items };
    } catch (error) {
        console.error('Pinterest Get Boards Error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.message || error.message };
    }
};

// Create a Board
export const createBoard = async (accessToken, name, description = '') => {
    try {
        const response = await axios.post(`${PINTEREST_API_URL}/boards`, {
            name: name,
            description: description
        }, {
            headers: getHeaders(accessToken)
        });
        return { success: true, board: response.data };
    } catch (error) {
        console.error('Pinterest Create Board Error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.message || error.message };
    }
};

// Create a Pin
export const createPin = async (accessToken, boardId, title, description, link, imageUrl) => {
    try {
        const payload = {
            board_id: boardId,
            title: title,
            description: description,
            link: link,
            media_source: {
                source_type: 'image_url',
                url: imageUrl
            }
        };

        const response = await axios.post(`${PINTEREST_API_URL}/pins`, payload, {
            headers: getHeaders(accessToken)
        });

        return { success: true, pin: response.data };
    } catch (error) {
        console.error('Pinterest Create Pin Error:', error.response?.data || error.message);
        return { success: false, error: error.response?.data?.message || error.message };
    }
};
