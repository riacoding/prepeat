import Flags from '@/components/Flags'
import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <main className='min-h-screen bg-white text-gray-800'>
      <section className='px-4 sm:px-6 py-20 text-center bg-orange-50'>
        <h1 className='text-4xl sm:text-5xl font-bold mb-2 text-prepeat-orange'>Sell Smarter. Serve Faster.</h1>

        <p className='text-lg sm:text-xl max-w-2xl mx-auto mb-4 leading-relaxed'>
          Online orders, pickup alerts, and KDS — all in one, made for Square.
        </p>
        <p className='text-md sm:text-lg text-gray-700 max-w-2xl mx-auto mb-10 leading-relaxed'>
          Be up and selling online in under 10 minutes. Designed for food trucks, cafés, and mobile vendors — with zero
          per-transaction fees.
        </p>
        <div className='flex justify-center mb-10'>
          <img
            src='/foodtruck.png'
            alt='Food truck with KDS'
            className='rounded-xl shadow-lg max-w-[300px] md:max-w-[600px] h-auto'
          />
        </div>
        <div className='mb-12'>
          <h2 className='text-2xl sm:text-3xl font-semibold mb-2 text-prepeat-orange'>Prep Eat Repeat</h2>
          <p className='text-gray-800 font-semibold text-sm'>(It's in the name)</p>
        </div>

        <div className='flex flex-col sm:flex-row justify-center gap-4'>
          <a
            href='/signup'
            className='bg-prepeat-orange text-white font-semibold px-6 py-3 rounded-xl hover:bg-orange-600 transition'
          >
            Sign Up Free – Start Selling
          </a>
          <a
            href='/demo'
            className='bg-white text-prepeat-orange border border-prepeat-orange font-semibold px-6 py-3 rounded-xl hover:bg-orange-100 transition'
          >
            Try Text-to-Menu Demo
          </a>
        </div>
      </section>

      <section className='py-16 px-4 sm:px-6 bg-white'>
        <div className='max-w-4xl mx-auto grid gap-8 sm:grid-cols-2'>
          <div>
            <h2 className='text-2xl font-semibold mb-2 flex items-center gap-2 transition-all'>
              <img src='/forkclock.png' alt='Easy Setup Icon' className='w-6 h-6' /> Easy Setup
            </h2>
            <p className='leading-relaxed'>
              Start taking online orders and notifying customers in minutes — no tech skills needed.
            </p>
          </div>
          <div>
            <h2 className='text-2xl font-semibold mb-2 flex items-center gap-2 transition-all'>
              <img src='/forkclock.png' alt='Menus Icon' className='w-6 h-6' /> Menus for Venues
            </h2>
            <p className='leading-relaxed'>Create and switch menus for each venue, location, or event with ease.</p>
          </div>
          <div>
            <h2 className='text-2xl font-semibold mb-2 flex items-center gap-2 transition-all'>
              <img src='/forkclock.png' alt='Text Notification Icon' className='w-6 h-6' /> Text Menus & Alerts
            </h2>
            <p className='leading-relaxed'>Menu discovery via text and automated pickup notifications.</p>
          </div>
          <div>
            <h2 className='text-2xl font-semibold mb-2 flex items-center gap-2 transition-all'>
              <img src='/forkclock.png' alt='No Fee Icon' className='w-6 h-6' /> No Per-Transaction Fees
            </h2>
            <p className='leading-relaxed'>We don’t take a cut of your orders. Your revenue stays yours.</p>
          </div>
          <div>
            <h2 className='text-2xl font-semibold mb-2 flex items-center gap-2 transition-all'>
              <img src='/forkclock.png' alt='KDS Icon' className='w-6 h-6' /> Kitchen Display Anywhere
            </h2>
            <p className='leading-relaxed'>
              Access your KDS from any phone, tablet, or screen — built for mobile operations.
            </p>
          </div>
        </div>
      </section>

      <footer className='px-6 py-16 text-center bg-gray-100'>
        <h3 className='text-xl font-semibold mb-6'>Stay informed as we grow</h3>
        <p className='text-gray-600 mb-6 max-w-xl mx-auto leading-relaxed'>
          Join the Prepeat mailing list to get updates on new features, launch news, and early access offers.
        </p>
        <form className='flex flex-col sm:flex-row justify-center gap-3 max-w-md mx-auto'>
          <label htmlFor='email' className='sr-only'>
            Email Address
          </label>
          <input
            id='email'
            type='email'
            placeholder='you@example.com'
            className='px-4 py-3 rounded-xl border border-gray-300 w-full sm:w-64'
          />
          <Button
            type='submit'
            className='bg-prepeat-orange text-white font-medium px-6 py-3 rounded-xl hover:bg-orange-600 transition'
          >
            Join the List
          </Button>
        </form>
      </footer>
    </main>
  )
}
