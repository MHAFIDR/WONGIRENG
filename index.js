require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const mysql = require('mysql2/promise'); // Menggunakan promise API dari mysql2
const cors = require('cors'); // Untuk mengizinkan Cross-Origin Resource Sharing

const app = express();
const port = 3000; // Port untuk server back-end

// Middleware
app.use(cors()); // Mengaktifkan CORS untuk semua permintaan
app.use(express.json()); // Mengizinkan Express untuk memparsing JSON dari body request

// Konfigurasi koneksi database MySQL dari environment variables
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306 // Default port MySQL jika tidak diatur di .env
};

let pool; // Variabel untuk menyimpan connection pool MySQL

// Fungsi asinkron untuk menginisialisasi connection pool database
async function initializeDatabasePool() {
    try {
        pool = mysql.createPool(dbConfig); // Membuat connection pool
        console.log('Terhubung ke database MySQL!');
        // Menjalankan query sederhana untuk memverifikasi koneksi
        await pool.query('SELECT 1 + 1 AS solution');
    } catch (error) {
        console.error('Gagal terhubung ke database:', error.message);
        // Penting: Keluar dari aplikasi jika koneksi DB gagal agar tidak berjalan tanpa DB
        process.exit(1);
    }
}

// Panggil fungsi inisialisasi pool saat aplikasi Node.js dimulai
initializeDatabasePool();

// --- API Endpoints untuk PRODUCTS (Produk) ---

// GET: Mengambil semua produk
// Path: /api/products
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json(rows); // Mengirimkan semua produk sebagai JSON
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Gagal mengambil produk.' });
    }
});

// GET: Mengambil produk berdasarkan ID
// Path: /api/products/:id
app.get('/api/products/:id', async (req, res) => {
    const { id } = req.params; // Mengambil ID dari parameter URL
    try {
        const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
        if (rows.length === 0) {
            // Jika produk tidak ditemukan, kirim status 404
            return res.status(404).json({ message: 'Produk tidak ditemukan.' });
        }
        res.json(rows[0]); // Mengirim produk pertama yang ditemukan (karena ID unik)
    } catch (error) {
        console.error('Error fetching product by ID:', error);
        res.status(500).json({ message: 'Gagal mengambil produk.' });
    }
});

// POST: Menambah produk baru
// Path: /api/products
app.post('/api/products', async (req, res) => {
    const { name, description, price, image_url, category } = req.body; // Mengambil data dari body request
    
    // Validasi dasar input
    if (!name || !price) {
        return res.status(400).json({ message: 'Nama dan harga produk wajib diisi.' });
    }
    if (isNaN(price) || parseFloat(price) <= 0) {
        return res.status(400).json({ message: 'Harga harus angka positif.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO products (name, description, price, image_url, category) VALUES (?, ?, ?, ?, ?)',
            [name, description, parseFloat(price), image_url, category] // Pastikan harga diubah ke float
        );
        // Mengirim respons 201 (Created) dengan data produk yang baru ditambahkan
        res.status(201).json({ 
            id: result.insertId, // ID yang dihasilkan oleh database
            name, 
            description, 
            price: parseFloat(price), // Kirim kembali harga sebagai float
            image_url, 
            category 
        });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ message: 'Gagal membuat produk.' });
    }
});

// PUT: Memperbarui produk berdasarkan ID
// Path: /api/products/:id
app.put('/api/products/:id', async (req, res) => {
    const { id } = req.params; // Mengambil ID dari parameter URL
    const { name, description, price, image_url, category } = req.body; // Mengambil data baru dari body request

    // Validasi dasar input
    if (!name || !price) {
        return res.status(400).json({ message: 'Nama dan harga produk wajib diisi.' });
    }
    if (isNaN(price) || parseFloat(price) <= 0) {
        return res.status(400).json({ message: 'Harga harus angka positif.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE products SET name = ?, description = ?, price = ?, image_url = ?, category = ? WHERE id = ?',
            [name, description, parseFloat(price), image_url, category, id]
        );
        if (result.affectedRows === 0) {
            // Jika tidak ada baris yang terpengaruh, berarti produk tidak ditemukan
            return res.status(404).json({ message: 'Produk tidak ditemukan.' });
        }
        res.json({ 
            id, 
            name, 
            description, 
            price: parseFloat(price), 
            image_url, 
            category, 
            message: 'Produk berhasil diupdate.' 
        });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ message: 'Gagal mengupdate produk.' });
    }
});

// DELETE: Menghapus produk berdasarkan ID
// Path: /api/products/:id
app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params; // Mengambil ID dari parameter URL
    try {
        const [result] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            // Jika tidak ada baris yang terpengaruh, berarti produk tidak ditemukan
            return res.status(404).json({ message: 'Produk tidak ditemukan.' });
        }
        res.status(200).json({ message: 'Produk berhasil dihapus.' }); // Mengirim status 200 OK
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ message: 'Gagal menghapus produk.' });
    }
});

// --- API Endpoints untuk ORDERS (Pesanan) ---

// POST: Membuat pesanan baru
// Path: /api/orders
app.post('/api/orders', async (req, res) => {
    // === REVISI: Tambahkan customerName dari body request ===
    const { items, customerIdentifier, customerName } = req.body; 

    if (!items || items.length === 0) {
        return res.status(400).json({ message: 'Pesanan harus memiliki item.' });
    }
    // Validasi tambahan untuk customerIdentifier dan customerName
    if (!customerIdentifier || customerIdentifier.trim() === '') {
        return res.status(400).json({ message: 'Identitas konsumen (customerIdentifier) wajib diisi.' });
    }
    if (!customerName || customerName.trim() === '') { // Validasi customerName
        return res.status(400).json({ message: 'Nama pembeli (customerName) wajib diisi.' });
    }

    let connection; 
    try {
        connection = await pool.getConnection(); 
        await connection.beginTransaction(); 

        let total_price = 0;
        const orderItemsToInsert = [];

        for (const item of items) {
            // Perhatikan bahwa di frontend, Anda mengirim product_id, quantity, price_at_order, name, image_url
            if (!item.product_id || !item.quantity || item.quantity <= 0 || !item.name || !item.price_at_order) {
                throw new Error('Detail item pesanan tidak valid: product_id, quantity, name, atau price_at_order kurang.');
            }
            
            // OPTIONAL: Validasi harga di backend terhadap harga asli produk
            // Ini sangat disarankan untuk keamanan, agar harga tidak bisa dimanipulasi dari frontend
            const [productRows] = await connection.query('SELECT price FROM products WHERE id = ?', [item.product_id]);
            if (productRows.length === 0) {
                throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan.`);
            }
            const actualProductPrice = productRows[0].price;

            // Anda bisa membandingkan item.price_at_order dengan actualProductPrice di sini
            // Misalnya: if (item.price_at_order !== actualProductPrice) { throw new Error('Harga tidak cocok'); }
            // Namun, untuk fleksibilitas histori, menyimpan price_at_order tetap penting.
            // PENTING: Gunakan actualProductPrice untuk perhitungan total_price yang aman
            const itemPriceCalculated = actualProductPrice * item.quantity; // Gunakan harga dari DB
            total_price += itemPriceCalculated; 
            
            orderItemsToInsert.push({
                product_id: item.product_id, // Gunakan product_id dari frontend
                quantity: item.quantity,
                price_at_order: actualProductPrice, // Simpan harga dari DB
                product_name: item.name,      // === REVISI: Simpan nama produk dari frontend ===
                image_url: item.image_url || null // === REVISI: Simpan image_url dari frontend ===
            });
        }

        // Insert pesanan ke tabel 'orders'
        // === REVISI: Tambahkan customer_name ke INSERT statement ===
        const [orderResult] = await connection.query(
            'INSERT INTO orders (customer_identifier, customer_name, total_price, status) VALUES (?, ?, ?, ?)', 
            [customerIdentifier, customerName, total_price, 'completed'] // Status 'completed' jika langsung dibayar
        );
        const order_id = orderResult.insertId; 

        // Insert setiap item pesanan ke tabel 'order_items'
        // === REVISI: Tambahkan product_name dan image_url ke INSERT statement ===
        for (const item of orderItemsToInsert) {
            await connection.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price_at_order, product_name, image_url) VALUES (?, ?, ?, ?, ?, ?)',
                [order_id, item.product_id, item.quantity, item.price_at_order, item.product_name, item.image_url]
            );
        }

        await connection.commit(); 
        res.status(201).json({ 
            order_id, 
            customerIdentifier, 
            customerName, // === REVISI: Kembalikan customerName juga ===
            total_price, 
            status: 'completed', 
            message: 'Pesanan berhasil dibuat.' 
        });

    } catch (error) {
        if (connection) {
            await connection.rollback(); 
        }
        console.error('Error creating order:', error.message);
        res.status(500).json({ message: `Gagal membuat pesanan: ${error.message}` });
    } finally {
        if (connection) {
            connection.release(); 
        }
    }
});

// GET: Mengambil semua pesanan (biasanya untuk admin)
// Path: /api/orders
app.get('/api/orders', async (req, res) => {
    try {
        // === REVISI: Pilih customer_name dari tabel orders ===
        const [orders] = await pool.query('SELECT id, customer_identifier, customer_name, total_price, status, created_at FROM orders ORDER BY created_at DESC');
        
        // Untuk setiap pesanan, kita juga ingin mengambil detail item-itemnya
        for (let order of orders) {
            // === REVISI: Pilih product_name dan image_url dari tabel order_items ===
            const [items] = await pool.query(
                'SELECT oi.product_id, oi.quantity, oi.price_at_order, oi.product_name, oi.image_url FROM order_items oi WHERE oi.order_id = ?', 
                [order.id]
            );
            order.items = items; // Tambahkan array item ke objek pesanan
        }
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Gagal mengambil pesanan.' });
    }
});


// --- NEW ENDPOINT: Mengubah status pesanan menjadi 'completed' ---
// Path: /api/orders/:id/complete
app.put('/api/orders/:id/complete', async (req, res) => {
    const { id } = req.params; // Mengambil ID pesanan dari parameter URL

    try {
        const [result] = await pool.query(
            'UPDATE orders SET status = ? WHERE id = ? AND status = ?', 
            ['completed', id, 'pending'] // Hanya update jika statusnya masih 'pending'
        );

        if (result.affectedRows === 0) {
            // Jika tidak ada baris yang terpengaruh, berarti pesanan tidak ditemukan atau statusnya sudah bukan 'pending'
            return res.status(404).json({ message: 'Pesanan tidak ditemukan atau sudah diproses.' });
        }

        res.status(200).json({ message: `Status pesanan ${id} berhasil diupdate menjadi 'completed'.` });

    } catch (error) {
        console.error('Error completing order:', error);
        res.status(500).json({ message: 'Gagal mengubah status pesanan.' });
    }
});

// --- NEW ENDPOINT: Mengambil riwayat pesanan (transaksi) untuk seorang konsumen ---
// Path: /api/orders/history/:customerIdentifier
app.get('/api/orders/history/:customerIdentifier', async (req, res) => {
    const { customerIdentifier } = req.params; // Mengambil customerIdentifier dari parameter URL

    if (!customerIdentifier || customerIdentifier.trim() === '') {
        return res.status(400).json({ message: 'Identitas konsumen (customerIdentifier) harus diberikan.' });
    }

    try {
        // === REVISI: Pilih customer_name dari tabel orders ===
        // Ambil semua pesanan dengan status 'completed' untuk customerIdentifier ini
        const [orders] = await pool.query(
            'SELECT id, customer_name, total_price, status, created_at FROM orders WHERE customer_identifier = ? AND status = ? ORDER BY created_at DESC',
            [customerIdentifier, 'completed']
        );

        // Untuk setiap pesanan, ambil detail item-itemnya
        for (let order of orders) {
            // === REVISI: Pilih product_name dan image_url dari tabel order_items ===
            const [items] = await pool.query(
                `SELECT 
                    oi.product_id, 
                    oi.quantity, 
                    oi.price_at_order, 
                    oi.product_name, 
                    oi.image_url 
                 FROM order_items oi 
                 WHERE oi.order_id = ?`, // Tidak perlu JOIN products lagi jika sudah disimpan di order_items
                [order.id]
            );
            order.items = items; // Tambahkan array item ke objek pesanan
        }

        res.json(orders); // Mengirimkan riwayat pesanan sebagai JSON

    } catch (error) {
        console.error('Error fetching customer transaction history:', error);
        res.status(500).json({ message: 'Gagal mengambil riwayat transaksi.' });
    }
});


// Jalankan server Express
app.listen(port, () => {
    console.log(`Server back-end berjalan di http://localhost:${port}`);
});