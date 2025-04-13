module Jekyll
  class RepoPageGenerator < Generator
    safe true

    def generate(site)
      # Get the list of repositories from _data/repositories.json
      repositories = site.data['repositories'] || []

      # Create a "repo" directory at the root for clean URLs
      repo_dir = File.join(site.source, 'repo')
      FileUtils.mkdir_p(repo_dir) unless File.directory?(repo_dir)

      # Generate pages for each repository
      repositories.each do |repository|
        # Extract repository information
        repo_name = repository['repo']
        branch = repository['branch'] || 'main'
        repo_description = repository['description']
        
        # Format title and meta data to EXACTLY match script.js format
        # If repo has description: "${repo}: ${currentRepoDescription}"
        # If no description: "${repo}: visualize and navigate github project structures"
        title = repo_description ? 
                "#{repo_name}: #{repo_description}" : 
                "#{repo_name}: visualize and navigate github project structures"
        
        # Format description to EXACTLY match script.js format
        description = "Effortlessly explore #{repo_name} and visualize the file structure of any public GitHub repository online. Navigate project folders, view directory trees, and copy paths without cloning."
        
        # Create directories for the repository URL structure
        owner, repo = repo_name.split('/')
        owner_dir = File.join(repo_dir, owner)
        FileUtils.mkdir_p(owner_dir) unless File.directory?(owner_dir)
        
        specific_repo_dir = File.join(owner_dir, repo)
        FileUtils.mkdir_p(specific_repo_dir) unless File.directory?(specific_repo_dir)
        
        branch_dir = File.join(specific_repo_dir, branch)
        FileUtils.mkdir_p(branch_dir) unless File.directory?(branch_dir)
        
        # Use site.url from _config.yml
        site_url = site.config['url'] || 'https://githubtree.mgks.dev'
        
        # Improve SEO by adding more specific keyword variations
        keywords = [
          "GitHub repository explorer",
          "#{owner}/#{repo} file structure",
          "browse #{owner}/#{repo} repository",
          "#{owner}/#{repo} code organization",
          "visualize #{repo} GitHub structure",
          "#{repo} directory tree",
          "explore #{owner} #{repo} files online",
          "GitHub project files viewer"
        ].join(", ")
        
        # Enhanced structured data with more specific details
        structured_data = {
          "@context" => "https://schema.org",
          "@type" => "WebApplication",
          "name" => "GitHubTree",
          "url" => "#{site_url}/repo/#{repo_name}/#{branch}/",
          "description" => description,
          "applicationCategory" => "DeveloperApplication",
          "operatingSystem" => "Web",
          "author" => {
            "@type" => "Person",
            "name" => "Ghazi Khan",
            "url" => "https://github.com/mgks"
          },
          "about" => {
            "@type" => "SoftwareSourceCode",
            "codeRepository" => "https://github.com/#{repo_name}",
            "programmingLanguage" => "GitHub Repository",
            "name" => repo_name,
            "description" => repo_description || "GitHub repository"
          }
        }
        
        # Create page with front matter and JSON-LD that exactly matches base.html
        page_content = <<~CONTENT
        ---
        layout: repo-page
        title: "#{title}"
        description: "#{description}"
        repo_name: "#{repo_name}"
        branch: "#{branch}"
        canonical_path: "/repo/#{repo_name}/#{branch}/"
        keywords: "#{keywords}"
        image: /assets/images/preview.png
        last_modified_at: #{Time.now.utc.strftime('%Y-%m-%dT%H:%M:%S+00:00')}
        ---
        <!-- This page is automatically generated for SEO purposes -->
        <script type="application/ld+json">
        #{JSON.pretty_generate(structured_data)}
        </script>
        CONTENT
        
        # Write the page file
        index_file = File.join(branch_dir, 'index.html')
        File.write(index_file, page_content)
        
        # Register the newly created page with Jekyll
        site.pages << Jekyll::Page.new(site, site.source, File.join('repo', owner, repo, branch), 'index.html')
      end
    end
  end
end 