import { useCallback, useEffect, useReducer, useRef } from 'react'

export function evaluationReducer (state, action) {
  if (action.type === 'replace') return { ...state, backup: { input: state.input, scenario: action.scenario }, input: action.input, response: null, error: '', dirty: true, loading: false, requestId: null }
  if (action.type === 'undo' && state.backup) return { ...state, input: state.backup.input, backup: null, response: null, error: '', dirty: true, loading: false, requestId: null }
  if (action.type === 'edit') {
    return { ...state, input: typeof action.input === 'function' ? action.input(state.input) : action.input, response: null, error: '', dirty: true, loading: false, requestId: null }
  }
  if (action.type === 'start') return { ...state, response: null, error: '', loading: true, requestId: action.id }
  if (action.id !== state.requestId) return state
  if (action.type === 'success') return { ...state, response: action.response, loading: false, dirty: false, requestId: null }
  if (action.type === 'error') return { ...state, error: action.error, loading: false, requestId: null }
  return state
}

export function useToolEvaluation (initialInput, evaluate) {
  const [state, dispatch] = useReducer(evaluationReducer, null, () => ({ input: initialInput(), response: null, error: '', dirty: false, loading: false, requestId: null }))
  const sequence = useRef(0)
  const busy = useRef(false)

  function setInput (input) {
    sequence.current += 1
    busy.current = false
    dispatch({ type: 'edit', input })
  }

  const run = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    const id = ++sequence.current
    dispatch({ type: 'start', id })
    try {
      const response = await evaluate({ input: state.input })
      if (id === sequence.current) dispatch({ type: 'success', id, response })
    } catch (error) {
      if (id === sequence.current) dispatch({ type: 'error', id, error: error.message || 'No se pudo completar la evaluación' })
    } finally {
      if (id === sequence.current) busy.current = false
    }
  }, [evaluate, state.input])

  useEffect(() => {
    const cancel = evaluateAfterPause(run)
    return () => { cancel(); sequence.current += 1; busy.current = false }
  }, [run])

  function replaceInput (input, scenario) {
    sequence.current += 1
    busy.current = false
    dispatch({ type: 'replace', input, scenario })
  }
  function undo () {
    sequence.current += 1
    busy.current = false
    dispatch({ type: 'undo' })
  }
  return { ...state, setInput, replaceInput, undo, run }
}

export function evaluateAfterPause (evaluate, delay = 400) {
  const timer = setTimeout(evaluate, delay)
  return () => clearTimeout(timer)
}
