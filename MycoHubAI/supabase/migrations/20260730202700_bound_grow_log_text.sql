update public.grow_logs
set
  title = left(title, 160),
  body = left(body, 8000)
where char_length(title) > 160 or char_length(body) > 8000;

alter table public.grow_logs
  add constraint grow_logs_title_length_check check (char_length(title) <= 160),
  add constraint grow_logs_body_length_check check (char_length(body) <= 8000);
