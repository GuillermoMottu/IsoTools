import { Router } from 'express'
import {
  runComparePlannedVsActual,
  runTrackProjectProgress
} from '../controllers/demoController.js'
import { requireSession } from '../auth/index.js'
import { rateLimit } from '../middleware/rateLimit.js'

const router = Router()
const toolPageId = process.env.TOOL_PAGE_ID

if (!toolPageId || toolPageId === 'compare_planned_vs_actual') {
  router.post('/compare_planned_vs_actual/run', requireSession, rateLimit(), runComparePlannedVsActual)
}

if (!toolPageId || toolPageId === 'track_project_progress') {
  router.post('/track_project_progress/run', requireSession, rateLimit(), runTrackProjectProgress)
}

export default router
