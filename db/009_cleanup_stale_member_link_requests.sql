update member_link_requests
set
  status = 'rejected',
  resolved_at = now()
where status = 'pending'
  and not exists (
    select 1
    from members
    where members.id = member_link_requests.requester_member_id
  );
