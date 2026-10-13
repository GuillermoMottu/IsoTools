import assert from 'node:assert/strict'
import { historyResult } from '../demo-frontend/src/historyView.js'
const root={event_id:'E1',event:'KPI_REPORT_GENERATED',data:{project_id:'P1'}}
const child={event:'PROJECT_AT_RISK',causation_id:'E1',data:{project_id:'P1',status:'at_risk'}}
const update={event_id:'E1',publication:{status:'stored'},chain:{events:[root,child]}}
assert.equal(historyResult(update,'project','P1').result.status,'at_risk')
assert.throws(()=>historyResult(update,'project','P2'))
assert.throws(()=>historyResult(update,'analysis','P1'))
assert.equal(historyResult({...update,chain:{events:[root]}},'project','P1').result,null)
assert.equal(historyResult({...update,publication:{status:'pending'}},'project','P1').result,null)
assert.equal(historyResult({...update,chain:{events:[root,{...child,causation_id:'OTHER'}]}},'project','P1').result,null)
const compare={event_id:'C1',publication:{status:'stored'},chain:{events:[{event_id:'C1',event:'PRODUCTION_VARIANCE_DETECTED',data:{analysis_id:'A1',status:'critical'}}]}}
assert.equal(historyResult(compare,'analysis','A1').result.status,'critical')
console.log('Tool history identity and causal result smoke OK')
