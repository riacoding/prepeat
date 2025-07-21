'use client'
import { useRouter } from 'next/navigation'
import { signOut } from 'aws-amplify/auth'
import { Button } from '@/components/ui/button'
import { useSafeAuthenticator } from '@/hooks/useSafeAuthenticator'

export default function DesktopMenu() {
  const { authStatus } = useSafeAuthenticator()
  const router = useRouter()

  async function handleLogout() {
    await signOut()
    router.push('/login')
  }

  function Display({ text }: { text: string }) {
    return <span className='font-medium text-xl text-prepeat-orange'>{text}</span>
  }

  return (
    <nav className='hidden md:flex gap-4 items-center'>
      {authStatus === 'authenticated' ? (
        <>
          <Button variant='ghost' onClick={() => router.push('/admin')}>
            <Display text='Menus' />
          </Button>
          <Button variant='ghost' onClick={() => router.push('/admin/kds')}>
            <Display text='KDS' />
          </Button>
          <Button variant='ghost' onClick={() => router.push('/admin/checklists')}>
            <Display text='Checklists' />
          </Button>
          <Button variant='ghost' onClick={() => router.push('/admin/settings')}>
            <Display text='Settings' />
          </Button>
          <Button variant='ghost' onClick={handleLogout}>
            <Display text='Logout' />
          </Button>
        </>
      ) : (
        <Button variant='ghost' onClick={() => router.push('/login')}>
          <Display text='Login' />
        </Button>
      )}
    </nav>
  )
}
