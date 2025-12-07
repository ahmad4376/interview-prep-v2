'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function CreateInterviewPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    jobTitle: '',
    company: '',
    jobDescription: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const token = await getToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/interviews/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        }
      );

      const data = await response.json();

      if (response.ok) {
        router.push(`/interview/${data.interviewId}`);
      } else {
        alert(data.message || 'Failed to create interview');
      }
    } catch (error) {
      console.error('Error creating interview:', error);
      alert('Failed to create interview');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-white">Create New Interview</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="jobTitle"
            className="block text-sm font-medium mb-2 text-gray-300"
          >
            Job Title *
          </label>
          <input
            type="text"
            id="jobTitle"
            required
            value={formData.jobTitle}
            onChange={(e) =>
              setFormData({ ...formData, jobTitle: e.target.value })
            }
            placeholder="e.g., Senior Frontend Engineer"
            className="w-full rounded-md border border-white/10 bg-[#0b0b0b] px-3 py-2 text-white placeholder-gray-500 outline-none ring-emerald-500/20 focus:ring-2"
          />
        </div>

        <div>
          <label
            htmlFor="company"
            className="block text-sm font-medium mb-2 text-gray-300"
          >
            Company *
          </label>
          <input
            type="text"
            id="company"
            required
            value={formData.company}
            onChange={(e) =>
              setFormData({ ...formData, company: e.target.value })
            }
            placeholder="e.g., Google, Meta, Amazon"
            className="w-full rounded-md border border-white/10 bg-[#0b0b0b] px-3 py-2 text-white placeholder-gray-500 outline-none ring-emerald-500/20 focus:ring-2"
          />
        </div>

        <div>
          <label
            htmlFor="jobDescription"
            className="block text-sm font-medium mb-2 text-gray-300"
          >
            Job Description *
          </label>
          <textarea
            id="jobDescription"
            required
            rows={10}
            value={formData.jobDescription}
            onChange={(e) =>
              setFormData({ ...formData, jobDescription: e.target.value })
            }
            placeholder="Paste the full job description here. Our AI will analyze it to select relevant interview questions..."
            className="w-full rounded-md border border-white/10 bg-[#0b0b0b] px-3 py-2 text-white placeholder-gray-500 outline-none ring-emerald-500/20 focus:ring-2"
          />
          <p className="mt-2 text-sm text-gray-400">
            Include key requirements, technologies, and responsibilities for
            best question matching
          </p>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-md bg-[#3ecf8e] px-6 py-3 font-semibold text-black hover:bg-[#36be81] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {loading ? 'Creating Interview...' : 'Create Interview'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-white/10 px-6 py-3 text-gray-300 hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
