import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { UiProvider } from '../context/UiContext'

vi.mock('../pages/Dashboard', () => ({
  default: () => <div>Private Dashboard</div>,
}))

vi.mock('../pages/Peers', () => ({
  default: () => <div>Peers</div>,
}))

vi.mock('../pages/Logs', () => ({
  default: () => <div>Logs</div>,
}))

vi.mock('../pages/Attestation', () => ({
  default: () => <div>Attestation</div>,
}))

vi.mock('../pages/Metrics', () => ({
  default: () => <div>Metrics</div>,
}))

vi.mock('../pages/Operations', () => ({
  default: () => <div>Operations</div>,
}))

vi.mock('../pages/Debug', () => ({
  default: () => <div>Debug</div>,
}))

vi.mock('../pages/Login', () => ({
  default: () => <div>Login Page</div>,
}))

vi.mock('../pages/PublicDashboard', () => ({
  default: () => <div>Public Network Status</div>,
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-path">{location.pathname}</div>
}

describe('App routing', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows the public dashboard at the site root for unauthenticated visitors', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <UiProvider>
          <AuthProvider>
            <App />
            <LocationProbe />
          </AuthProvider>
        </UiProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Public Network Status')).toBeInTheDocument()
    expect(screen.getByTestId('location-path')).toHaveTextContent(/^\/$/)
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })

  it('still redirects protected routes to login when not authenticated', async () => {
    render(
      <MemoryRouter initialEntries={['/peers']}>
        <UiProvider>
          <AuthProvider>
            <App />
            <LocationProbe />
          </AuthProvider>
        </UiProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Login Page')).toBeInTheDocument()
  })
})
