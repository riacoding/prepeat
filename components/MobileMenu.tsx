'use client'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'
import { signOut } from 'aws-amplify/auth'
import { useSafeAuthenticator } from '@/hooks/useSafeAuthenticator'

export default function MobileMenu({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { authStatus } = useSafeAuthenticator()
  const router = useRouter()

  async function handleLogout() {
    await signOut()
    router.push('/login')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size={'icon'} className='md:hidden [&_svg]:size-8'>
          <Menu size={24} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align='end' className='w-40'>
        {authStatus === 'authenticated' && (
          <>
            <DropdownMenuItem onClick={() => router.push('/admin')}>Menus</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/admin/kds')}>KDS</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/admin/checklists')}>Checklists</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/admin/settings')}>Settings</DropdownMenuItem>
          </>
        )}
        {authStatus === 'authenticated' ? (
          <DropdownMenuItem onClick={() => handleLogout()}>Logout</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => router.push('/login')}>Login</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
