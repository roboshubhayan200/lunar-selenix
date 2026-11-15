import { Component } from 'react'

/**
 * Keeps a WebGL/render failure inside one card instead of unmounting the app.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('[ErrorBoundary]', this.props.label || '', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex h-full w-full items-center justify-center p-6 text-center">
          <div>
            <div className="font-display text-sm font-semibold text-ink">{this.props.label || '3D view'} unavailable</div>
            <div className="mt-1 max-w-xs text-xs text-ink-muted">
              {String(this.state.error?.message || this.state.error)}. WebGL may be disabled or the GPU context was lost.
            </div>
            <button type="button" className="btn-ghost mt-3 !py-1.5 !text-xs" onClick={() => this.setState({ error: null })}>Retry</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
