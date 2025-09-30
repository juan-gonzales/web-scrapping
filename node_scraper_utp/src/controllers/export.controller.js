import { generateComparisonReport } from '../services/export.service.js';

export const exportComparisonReport = async (req, res, next) => {
  try {
    const eventId = req.body?.web_scraper_event_id;
    if (!eventId) {
      return res.status(400).json({ message: 'web_scraper_event_id es obligatorio' });
    }

    const buffer = await generateComparisonReport(eventId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="course-comparison-${eventId}.xlsx"`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};
