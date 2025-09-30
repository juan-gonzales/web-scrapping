import 'dotenv/config';
import express from 'express';
import routes from './routes/index.js';

const app = express();

app.use(express.json());

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal Server Error', detail: err.message });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
