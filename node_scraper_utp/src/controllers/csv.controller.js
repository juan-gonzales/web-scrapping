import { processCsvOrchestration } from '../services/orchestrator.service.js';

export const getCsvInfo = (req, res) => {
  res.json({ message: 'Use POST method to upload a CSV file' });
};

export const postCsv = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'Debe adjuntar un archivo CSV en csv_file' });
    }

    const result = await processCsvOrchestration(req.file.buffer);

    res.json({
      message: 'CSV file processed successfully',
      event_id: result.event_id,
      results: result.results
    });
  } catch (error) {
    next(error);
  }
};
