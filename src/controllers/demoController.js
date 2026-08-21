import {
  runComparePlannedVsActualTool,
  runTrackProjectProgressTool
} from '../services/compareTrackDemoService.js'

export function runComparePlannedVsActual (req, res, next) {
  try {
    const result = runComparePlannedVsActualTool(req.body || {})
    return res.json(result)
  } catch (error) {
    return next(error)
  }
}

export function runTrackProjectProgress (req, res, next) {
  try {
    const result = runTrackProjectProgressTool(req.body || {})
    return res.json(result)
  } catch (error) {
    return next(error)
  }
}
