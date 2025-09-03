import { SortOption } from '@/types'

const SortDropdown = ({ sort, setSort }: { sort: SortOption; setSort: (value: SortOption) => void }) => {
  return (
    <label className='text-sm font-medium'>
      Sort:
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortOption)}
        className='ml-2 border rounded px-2 py-1 text-sm'
      >
        <option value='Newest'>Newest</option>
        <option value='Oldest'>Oldest</option>
        <option value='All Day'>All Day</option>
      </select>
    </label>
  )
}

export default SortDropdown
