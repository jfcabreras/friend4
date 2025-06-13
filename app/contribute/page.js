'use client';

const Contribute = ({ setSelectedSection }) => {

  const handleSectionChange = (section) => {
    setSelectedSection(section);  // Update the selected section state in the parent component
  };

  return (
    <>
    <div className="contribute">
      <h3>Este es nuestro Vaki.</h3>
      <h2>Gracias!</h2>
      <iframe id="vakiIframe"
        title="Friend 4"
        width="350"
        height="590"
        src="https://vaki.co/iframe/PC27hXlqDFL5JVpre4oY">
      </iframe>
    </div>
    </>
  )
}

export default Contribute;