-- Create beta_feedback table for collecting user feedback during beta period
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  category TEXT NOT NULL CHECK (category IN ('bug_report', 'feature_request', 'general_feedback', 'other')),
  message TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  route TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_beta_feedback_business_id ON public.beta_feedback(business_id);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_user_id ON public.beta_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_category ON public.beta_feedback(category);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status ON public.beta_feedback(status);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_created_at ON public.beta_feedback(created_at DESC);

-- Enable RLS
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only insert their own feedback
CREATE POLICY "Users can insert their own feedback"
  ON public.beta_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can only view their own feedback
CREATE POLICY "Users can view their own feedback"
  ON public.beta_feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Service role can do everything
CREATE POLICY "Service role can manage all feedback"
  ON public.beta_feedback
  FOR ALL
  USING (auth.role() = 'service_role');
